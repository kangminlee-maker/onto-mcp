---
deliberation_status: performed
participation:
  expected_lenses:
    - axiology
    - coverage
    - evolution
    - logic
    - semantics
    - structure
  received_lenses:
    - axiology
    - coverage
    - evolution
    - logic
    - semantics
    - structure
  missing_or_failed_lenses: []
  run_status: full
  synthesis_run_status: full
---
# Synthesize

## Consensus
- issue-001 (high): Result와 Report에 동일한 임상 상태를 중복 저장하고 Report를 지연 동기화된 권위 값으로 사용하는 현재 모델은, corrected 이후 최신 상태의 신뢰성과 상태 모델 변경 시 의미의 연속성을 모두 보장하지 못한다.
  - root cause: Result와 Report에 동일한 상태 의미를 서로 다른 폐쇄형 어휘로 중복 저장하고 배치 동기화로 결합한 설계가 현재 상태 불일치와 상태 모델 변경 위험을 함께 만든다.
  - materiality: 임상의가 신뢰해야 할 Report 상태가 야간 동기화 전까지 원천 Result 상태와 다를 수 있어 현재 임상 표시의 정확성과 EMR/LIS 간 일관성을 직접 약화한다. 또한 상태 추가·명칭 변경·외부 표준 매핑 변경 시 두 enum과 동기화 규칙을 함께 변경해야 하고 버전 경계도 없어 과거 기록의 의미를 안정적으로 재현하기 어렵다. 따라서 신뢰 가능하고 변경 내성 있는 결과 상태 권위를 제공한다는 선언 목적이 훼손된다.
  - action: 먼저 임상 결과 상태의 단일 권위를 정해야 한다. 기본 방향은 Result 상태를 권위로 삼고 Report 상태를 즉시 파생하며 원본 상태 참조, 변환 시점 및 유효 매핑 버전을 기록하는 것이다. 두 상태가 실제로 다른 개념이어야 한다면 먼저 각각의 의미와 권위를 분리해 정의한 뒤, 명시적이고 버전 가능한 매핑·전이 원자성·실패 및 재처리 계약을 마련하고 corrected 반영을 동기식 또는 전달이 보장된 이벤트 처리로 전환해야 한다. 권위와 의미 계약을 먼저 확정해야 동기화 방식과 이력 보존이 일관되게 구현될 수 있다.
- issue-006 (high): 검증·배포·정정·중대결과 통보가 occurrence identity를 가진 감사 사건으로 표현되지 않아 책임과 근거를 재구성할 수 없으며, CriticalValue는 재사용 규칙과 결과별 통보 사건을 혼합해 특정 결과의 통보 완료 여부를 신뢰할 수 없게 만든다.
  - root cause: 임상 통제 행위를 occurrence identity를 가진 감사 사건으로 모델링하지 않고 현재 상태나 boolean으로 축약한 선택이 전반적인 이력 공백과 CriticalValue 규칙·사건 혼합을 함께 만든다.
  - materiality: EMR/LIS가 신뢰할 수 있는 결과·보고 상태와 중대결과 통보 증거를 공유하려면 누가 언제 어떤 근거로 어떤 Result를 처리했는지 확인할 수 있어야 한다. 현재 모델은 상태와 boolean만 제공하므로 통제 행위의 수행 및 책임을 입증하지 못하고, 여러 Result가 같은 임계 규칙에 해당할 때 특정 결과가 통보되었다는 거짓 완료 판단을 허용해 임상 안전 목적을 직접 약화한다.
  - action: 현재 차단 이슈로서 검증, 보고서 배포, 결과 정정, 중대결과 통보를 각각 occurrence identity가 있는 독립 사건으로 만들고 actor, occurred_at, reason/evidence 및 대상 Result를 연결해야 한다. 정정 사건에는 이전·새 결과 버전을, 통보 사건에는 recipient, method, status와 acknowledgement를 포함해야 한다. CriticalValue는 먼저 버전이 관리되는 CriticalValueRule과 triggering Result에 연결된 CriticalResultOccurrence로 분리하고, 통보 기록은 occurrence에 연결해야 여러 결과의 의무와 완료 상태를 개별적으로 판정할 수 있다.
- issue-008 (high): 상태, 카탈로그, 파생 지표가 여러 시스템에 병행 저장되지만 canonical authority와 reconciliation lifecycle이 정의되지 않아 서로 다른 값이 정상 상태로 공존할 수 있는 high 결함이다.
  - root cause: 여러 시스템의 projection을 별도 값으로 선언하면서 canonical authority와 reconciliation lifecycle을 함께 정의하지 않은 것이 교차 시스템 불일치를 허용한다.
  - materiality: 이 문서는 EMR/LIS 통합에서 공유 개념의 우선순위와 권위를 결정해야 한다. 그러나 야간 동기화 지연·실패, Test–Assay 불일치 또는 TAT 공식 변경 시 어느 값을 채택하고 어떻게 복구할지 판단할 근거가 없어 임상 표시와 운영 지표가 서로 달라질 수 있으므로 그 목적을 직접 훼손한다.
  - action: 공유 개념별 authoritative source를 먼저 지정한 뒤 Result–Report 상태 매핑, 동기화 지연·실패 상태, Test–Assay 정합성 검증, 충돌 판정·복구 절차를 정의해야 한다. 이어 TAT 공식의 canonical definition과 버전 규칙을 같은 계약에 연결해야 소비 시스템이 채택할 값과 복구 순서를 일관되게 결정할 수 있다.
- issue-014 (high): Result.status와 Report.result_status는 동일 상태 정보를 유지해야 하지만 허용값이 서로소이고 정규 매핑도 없어, 값 동일성 계약으로 해석하면 어떤 유효 상태도 양쪽 계약을 동시에 만족할 수 없습니다.
  - root cause: 하나의 상태 개념을 서로소 enum으로 선언하면서 정규 매핑 또는 '동일 정보'의 의미를 정의하지 않은 것이 상태 계약을 충족 불가능하게 만든다.
  - materiality: 이 결함은 유효한 Result 상태를 Report에 그대로 전달하지 못하게 합니다. 그 결과 각 EMR/LIS 구현이 서로 다른 변환을 만들고 권위 상태 판정이 달라질 수 있으므로, 결과 상태의 개념 권위와 교환 계약을 제공하려는 통합 목적을 직접 약화합니다.
  - action: 먼저 상태 개념의 권위와 의미를 확정한 뒤 하나의 정규 enum을 두 속성에서 재사용해야 합니다. 별도 enum 유지가 필요하면 preliminary↔prelim, final↔finalized, corrected↔amended 같은 전단사 의미 매핑과 권위·동기화 규칙을 명시해야 합니다. 이 공유 원인을 먼저 바로잡은 후 각 속성의 검증과 교환 계약을 그 정의에 연결해야 부분별 임시 변환이 다시 분기되는 것을 막을 수 있습니다.
  - unresolved disagreement: 렌즈 간 미해결 이견은 없습니다. 다만 ‘동일 정보’가 리터럴 동일성인지 의미적 동등성인지 현재 계약에는 명시되어 있지 않으며, 수정 과정에서 반드시 확정해야 합니다.
- issue-015 (high): 현재 모델이 허용하는 corrected-before-release 경로에서는 단일 Report.result_status에 amended와 finalized가 동시에 요구되어 상태 계약을 만족할 수 없다.
  - root cause: Report 상태를 강제하는 corrected 및 release 규칙에 사건 순서, 우선순위와 종결 불변식이 없는 것이 단일 상태 필드에 상충 의무를 만든다.
  - materiality: 같은 사건 이력을 처리한 EMR과 LIS가 서로 다른 우선순위를 선택할 수 있으므로 최종 임상 표시 상태가 구현마다 달라진다. 이는 두 시스템이 동일하고 신뢰할 수 있는 보고서 상태를 결정해야 한다는 개념 권위를 직접 훼손하는 현재의 고심각도 정확성 문제다.
  - action: 현재 권위 모델에서 corrected와 release의 허용 순서, 충돌 우선순위, 최종 상태를 먼저 결정하고 이를 결정표와 실행 가능한 불변식으로 명시해야 한다. corrected를 release/finalized 이후에만 허용해 amended를 종결 우선 상태로 만들거나, corrected-before-release를 허용한다면 이후 release에도 amended가 유지되도록 하나의 규칙을 선택해야 한다. 이 전이 계약을 먼저 확정해야 EMR/LIS 구현과 향후 상태 확장이 동일한 결과를 따를 수 있다.
- issue-016 (high): Result.status와 Report.result_status의 의미 경계와 권위가 정의되지 않아, 동일한 결과 finality를 서로 호환되지 않는 어휘로 표현하는 경쟁 상태가 발생한다. 두 상태가 별도 사실일 가능성은 조치의 분기 조건으로 좁혀졌지만, 이 문제의 high 심각도와 종결 필요성은 유지되었다.
  - root cause: 결과 검증 상태와 보고서 lifecycle 상태를 구분하지 않고 각 개념의 권위를 지정하지 않은 것이 경쟁하는 상태 의미를 만든다.
  - materiality: corrected Result와 finalized Report가 동기화 지연 중 공존하거나 소비자가 선언되지 않은 enum 매핑을 수행하면, EMR/LIS와 임상의 화면에 오래되거나 모순된 finality가 노출될 수 있다. 이는 임상 결과의 신뢰성을 훼손하므로, 온톨로지가 EMR/LIS 통합과 임상의 결과 해석을 위한 개념 권위 문서로 기능하려는 목적을 직접 약화한다.
  - action: 먼저 Result 상태가 결과 검증을, Report 상태가 발행·정정 lifecycle을 나타내는 별도 사실인지 결정해야 한다. 별도 사실이면 각각의 상태 어휘와 권위 주체, 전이 관계, 소비자 해석 규칙을 명시한다. 같은 사실이면 하나만 canonical 권위로 유지하고 다른 표현은 명시적이고 손실 없으며 적시에 적용되는 버전 매핑으로 파생해야 하며, 두 표현이 독립적으로 동일 사실의 권위라는 주장은 제거해야 한다. 이 의미·권위 결정이 매핑과 동기화 구현보다 선행되어야 한다.
- issue-020 (high): 주문 가능한 Test와 실제 수행되는 Assay를 연결하는 realization 관계가 없어 EMR 주문을 LIS 실행 항목으로 권위 있게 변환할 수 없다.
  - root cause: 주문 가능 개념과 실행 가능 개념을 별도로 도입하면서 두 개념을 묶는 realization 관계를 누락한 것이 핵심 EMR–LIS handoff를 끊는다.
  - materiality: Test와 Assay가 서로 다른 레코드나 코드를 사용하거나 일대다·다대일 대응이 필요한 경우, 구현체가 문서 밖에서 매핑을 임의로 정해야 한다. 이는 Order부터 Report까지의 통합 권위를 약화시키고 잘못된 검사의 수행 또는 보고로 이어질 수 있으므로 material한 high 결함이다.
  - action: 먼저 Test와 Assay를 별도 카탈로그 권위로 유지할지 결정해야 한다. 별도로 유지한다면 식별자, 허용 카디널리티, 변경·버전 의미를 명시한 Test–Assay realization 매핑을 핵심 실행 경로에 추가하고, assay 수준 추적성이 필요하면 Result도 선택된 실행 단위에 연결해야 한다. 별도 개념이 불필요하다면 두 개념을 통합해 Test를 단일 카탈로그 권위로 삼아야 한다.
- issue-002 (medium): 중대결과 통보는 notified 요약값만 온톨로지에 남고 그 근거 사건과 증거는 안정적으로 연결되지 않은 외부 대장에 분산되어 있어, 통보 완료 여부를 온톨로지 경계 안에서 검증·추적할 수 없다.
  - root cause: 통보 완료라는 파생 요약만 온톨로지에 두고 근거 사건의 권위를 안정적 연결이 없는 외부 대장에 남긴 것이 통보 증거 공백을 만든다.
  - materiality: 시스템이 notified의 근거, 통보 시각 또는 수신자를 확인·교환해야 할 때 구현마다 서로 다른 외부 기록과 해석에 의존하게 된다. 이는 핵심 안전 사건의 감사 가능성을 약화하고, EMR/LIS 통합의 운영 위험까지 포괄하는 공통 개념 권위를 제공하려는 목적을 훼손한다.
  - action: 다음 단계 전에 통보 증거의 권위 경계를 결정해야 한다. 기본 조치는 통보를 Result 또는 CriticalValue에 연결된 독립 사건으로 모델링하고 통보 시각, 발신자, 수신자, 전달 방식, 확인 상태를 포함하는 것이다. 외부 대장을 계속 권위 원천으로 유지한다면 안정적 참조 키와 함께 동기화, 수명주기 및 불일치 처리 계약을 명시해야 감사 가능한 통합 계약을 만들 수 있다.
- issue-003 (medium): Test와 Assay의 역할 또는 동일성을 확정하지 않은 채 매핑 없이 이중 등록하면 EMR과 LIS가 공유할 검사 카탈로그의 단일 권위가 성립하지 않는다. 이 문제는 다음 단계로 진행하기 전에 결정하고 닫아야 한다.
  - root cause: Test와 Assay의 동일성 또는 역할 분리를 결정하지 않은 채 대응 관계 없이 이중 등록을 운영 규칙으로 채택한 것이 카탈로그 권위를 분산한다.
  - materiality: 신규·변경 검사 항목이 주문 측 Test와 수행 측 Assay에 각각 등록되지만 동일성, 대응 카디널리티, 식별자, 변경 책임이 정해져 있지 않다. 그 결과 각 시스템이 대응 관계를 독자적으로 해석하고 카탈로그가 분기되어, 통합 문서가 주문과 수행 항목의 동일성을 보장하는 단일 기준으로 기능할 수 없다.
  - action: 먼저 Test와 Assay의 역할을 확정해야 한다. 서로 다른 개념이라면 명시적 매핑 관계, 카디널리티, 식별자, 변경 권위와 함께 유효기간·버전·계승 규칙을 정의하고, 같은 개념이라면 하나의 canonical 개념으로 통합한 뒤 시스템별 코드를 매핑 속성으로 관리해야 한다. 이 결정을 완료하고 실제 연결 규칙을 검증하기 전에는 문서를 EMR/LIS 통합 권위로 승격하지 않아야 한다.
- issue-004 (medium): 정규 TAT 공식의 우선순위와 예외·결측·취소·시간대·버전 및 일치 검증 계약이 없으므로, 현재 온톨로지는 EMR/LIS 간 동일한 지표 의미를 안정적으로 보장하지 못한다. 이는 medium 수준의 조건부 계약 결함이며, 외부 대시보드 공식이 실제로 canonical 정의와 불일치한다는 점까지 입증된 것은 아니다.
  - root cause: TAT의 의미 권위와 계산 실행 권위를 분리하면서 정규 공식의 우선순위와 일치 검증 계약을 정의하지 않은 것이 지표 의미를 불안정하게 만든다.
  - materiality: 공통 개념 권위 문서는 같은 사건에서 같은 TAT 의미와 재현 가능한 값을 제공해야 한다. 현재 계약 누락 상태에서는 소비자가 서로 다른 경계와 예외를 적용해 동일한 TAT 이름으로 다른 값을 만들 수 있으므로, 운영 판단과 시스템 간 비교 가능성이 약화된다.
  - action: 다음 단계 전에 canonical TAT의 정규 공식과 우선순위를 먼저 확정하고, 포함·제외 조건, 예외·결측·취소 처리, 시간대 기준과 버전 규칙을 권위 계약으로 정의해야 한다. 이어 대시보드가 해당 계약을 소비하도록 파생 관계와 일치 검증을 연결해야 한다. 별도 운영 지표가 필요하면 canonical TAT와 다른 이름과 목적, 버전을 부여해 의미 혼동을 차단해야 한다.
- issue-005 (medium): Specimen 모델이 정상 분석 경로에만 한정되어 부적합·분실·재채취와 분석 후 보관·폐기 같은 예외·종결 경로를 표현하지 못하는 중간 심각도의 완전성 결함이다.
  - root cause: Specimen 모델을 정상 분석 경로에 한정하고 예외 및 물리적 종결 처리를 외부 부서 규정에 맡긴 것이 lifecycle 공백을 만든다.
  - materiality: Order부터 Report까지의 임상검사 workflow를 EMR/LIS 통합의 개념 권위로 제공하려면 결과를 만들지 못한 검체와 분석 후 물리적으로 종결된 검체도 구분할 수 있어야 한다. 현재 모델로는 실제 검체 상태와 주문 미완료 원인을 시스템 간에 일관되게 교환하거나 재구성할 수 없어 그 목적이 약화된다.
  - action: 다음 단계 전에 collection_failed, rejected, lost, retained, disposed 등 필요한 예외·종결 상태를 정의하고, 거부·재채취·보관·폐기를 사유·행위자·시각을 갖는 사건으로 모델링해야 한다. 먼저 공통 lifecycle 상태와 사건 구조를 확립한 뒤 기관별 보관·폐기 정책을 그 구조에 매핑해야 시스템 간 교환과 이력 재구성이 가능하다.
- issue-007 (medium): 변경 가능한 Test, Assay, CriticalValue를 단일 현재 상태로만 표현하고 Result가 적용된 정의 버전을 고정하지 않아, 변경 후 과거 결과의 당시 의미와 판정 근거를 재현할 수 없다.
  - root cause: 변경 가능한 Test, Assay 및 CriticalValue 기준정보를 시간적 정체성이 있는 버전 대신 단일 현재 레코드로 모델링한 것이 과거 의미 재현을 막는다.
  - materiality: 검사 항목·수행 단위·위험 임계값을 장기간 일관되게 해석해야 하는 통합 권위가 최신 정의로 과거 의미를 덮어쓸 수 있다. 그 결과 시스템별 해석과 감사·재판정 결과가 달라질 수 있으므로 material한 medium 이슈이다.
  - action: 먼저 Test, Assay, CriticalValue를 시간적 정체성이 있는 버전으로 모델링하고 각 버전에 유효기간과 계승 관계를 추가해야 한다. 그다음 Result 또는 수행 사건이 실제 적용된 불변 버전을 참조하도록 해야 한다. 이 버전 기반 기준정보 토대는 dep-005로 연결된 관련 문제와 공유될 수 있으므로, 개별 결과 참조를 붙이기 전에 공통 버전·이력 구조를 확정해야 한다.
- issue-009 (medium): 주문 항목과 실제 검사 수행 occurrence를 구분하는 계층이 없어 주문 의도에서 결과까지의 핵심 provenance 경로가 비어 있다.
  - root cause: 카탈로그 정의와 실제 주문·검사 수행 occurrence를 분리하지 않고 직접 관계로 축약한 것이 주문에서 결과까지의 provenance 공백을 만든다.
  - materiality: 이 공백은 반복 수행, 재검, 여러 검체 사용, 수행 실패, Test–Assay 매핑이 필요한 상황에서 어떤 주문 항목이 어떤 검체와 Assay로 수행되어 어떤 Result를 만들었는지 일관되게 해석하지 못하게 한다. 따라서 Order부터 Report까지의 실제 임상검사 수행 경로를 권위 있게 표현하려는 목적이 약화된다.
  - action: 먼저 Test·Assay 카탈로그 정의와 실제 occurrence를 분리하는 canonical 실행 모델을 세운 뒤, OrderItem 또는 TestRequest와 TestExecution 또는 AssayRun을 추가해야 한다. 이어 주문 항목, 사용 검체, Test–Assay 매핑, 수행 시각·장비·방법, 재시도·실패, 산출 Result를 연결해 각 결과의 귀속과 이력을 추적 가능하게 해야 한다. 이 결함은 다음 단계 전 반드시 닫아야 하며, issue-018과 공유하는 실행 모델 원인 후보도 함께 정합성을 유지해야 한다.
- issue-010 (medium): Result가 범용 문자열 값과 단위로 평탄화되어 수치형·정성형·패널형·방법 의존 결과의 유형과 해석 맥락을 보존하지 못하므로, 다음 단계 전에 typed observation 구조로 확장해야 한다.
  - root cause: Result를 임상 관찰과 해석의 복합 개념이 아닌 범용 문자열 값으로 평탄화한 것이 의미 맥락 손실을 만든다.
  - materiality: 비수치·패널 결과나 참고범위·방법에 따라 해석이 달라지는 결과를 교환할 때 관찰 시각, 참고범위, 판정, 방법, 구성요소가 소실된다. 그 결과 EMR과 LIS의 표시·판정·의사결정 시스템이 같은 값에 서로 다른 임상 의미를 부여할 수 있어, 다양한 검사 결과를 의미 손실 없이 교환한다는 목적을 직접 약화한다.
  - action: 다음 단계 전에 Result를 typed observation으로 확장하고 관찰 시각, 유형별 값, 단위, 참고범위, 해석 또는 이상 판정, critical assessment, 방법, component 관계를 명시적으로 모델링해야 한다. 먼저 공통 관찰·해석 구조와 관계를 정의한 뒤 구체적인 검사 유형을 그 구조에 매핑해야 기존 기록의 의미를 유지하면서 새 값 유형과 방법을 확장할 수 있다.
- issue-011 (medium): Test와 Assay가 독립적으로 관리되면서 두 항목의 구현 관계와 유효기간·버전·계승 이력이 모델링되지 않아, 카탈로그 변경 전후의 주문과 실제 수행 항목을 지속적으로 연결할 수 없다.
  - root cause: 독립 카탈로그인 Test와 Assay 사이에 변경 이력을 보존하는 구현 관계가 없는 것이 카탈로그 변경 연속성을 끊는다.
  - materiality: 신규 분석법 도입, 장비 교체, 검사 통합·분할 또는 코드 개정 때 두 카탈로그를 수동으로 동기화해야 하고, 과거 주문·결과가 당시의 Assay 정의와 단절될 수 있다. 이는 EMR/LIS 연동에서 주문과 수행 항목을 장기간 일관되게 연결하는 개념 권위 문서의 목적을 약화시키며 통합 규칙과 감사 가능성에 대한 신뢰를 떨어뜨린다.
  - action: Test를 주문 카탈로그의 권위 개념으로 유지하고 Test–Assay 구현 관계에 유효기간, 버전, 계승·대체 관계를 추가해야 한다. 이후 신규 항목의 이중 등록 규칙을 단일 등록과 명시적 매핑 절차로 교체하여, 새 절차가 기존 주문·결과의 역사적 연결을 보존하도록 다음 단계 전에 닫아야 한다.
- issue-012 (medium): 검체 분류가 Specimen과 Test의 폐쇄형 enum 및 Assay의 자유 문자열에 중복되어 있어, 새 검체 유형이나 외부 코드를 도입할 때 여러 표현과 매핑을 함께 수정해야 한다.
  - root cause: 하나의 검체 분류 개념을 공유 코드 체계 없이 두 폐쇄형 enum과 자유 문자열로 중복 표현한 것이 확장 시 변환 규칙을 분산한다.
  - materiality: 이 구조는 동일 검체가 시스템별로 다른 문자열로 축적되게 하고 스키마와 변환 규칙의 동시 변경을 요구한다. 따라서 EMR/LIS가 검체 요구사항과 실제 검체를 확장 가능한 공통 개념으로 교환하기 어렵고, 장기 데이터 연속성과 통합 신뢰가 약화된다.
  - action: 다음 단계 전에 검체 유형을 버전 가능한 공통 코드 개념으로 승격하고 Specimen, Test, Assay가 이를 참조하도록 해야 한다. 상·하위 유형, 동의어와 외부 코드 매핑, 유효기간, 폐기·대체 관계를 그 공통 권위에 두어야 새 유형 추가가 여러 스키마와 변환 규칙의 동시 수정으로 번지는 것을 막고 과거 데이터의 연속성을 유지할 수 있다.
- issue-013 (medium): 발급자·namespace·시간 범위가 없는 문자열 식별자와 업무 코드만으로는 다기관·다중 시스템의 정체성을 충돌 없이 구분하거나 코드 변경 이력을 지속적으로 연결할 수 없다.
  - root cause: 식별자와 업무 코드를 발급자, namespace 및 시간 범위가 없는 문자열로 모델링한 것이 교차 시스템 충돌과 코드 이력 단절을 만든다.
  - materiality: 두 개 이상의 EMR/LIS를 통합하거나 코드가 개정·재사용·병합·폐기되면 동일 문자열이 서로 다른 개념을 가리킬 수 있다. 이때 변경 전후 레코드도 안정적으로 연결할 수 없어, 서로 다른 시스템의 환자·검사·조직·인력 개념을 연결하고 장기 추적하는 권위 문서라는 목적이 약화된다.
  - action: 다음 단계 전에 공통 Identifier/CodeAssignment 개념을 도입하고 값, 발급자 또는 namespace, 코드 시스템 버전, 유효기간, 상태 및 replaces/same-as 대체 매핑을 표현해야 한다. 기존 엔티티의 문자열 식별자와 코드는 이 공통 개념을 참조하도록 단계적으로 전환해 출처 충돌을 방지하고 과거 의미와 변경 후 레코드의 연결을 보존해야 한다.
- issue-017 (medium): STAT이 변경 가능한 주문 우선순위임에도 subtype, enum 값, boolean으로 독립 표현되어 동일 Order에 서로 모순된 STAT 분류를 허용한다.
  - root cause: 변경 가능한 우선순위 역할을 독립적인 subtype으로 승격하면서 enum과 boolean projection도 쓰기 가능한 상태로 남긴 것이 STAT 분류 중복을 만든다.
  - materiality: EMR/LIS가 세 표현 중 일부만 수신하거나 주문 후 priority가 변경되면 시스템마다 긴급도를 다르게 해석해 라우팅과 처리 순서가 달라질 수 있으므로, 명확한 주문 우선순위 의미를 제공하려는 통합 목적이 약화된다.
  - action: 다음 단계 전에 Order.priority를 STAT 분류의 canonical authority로 정하고 priority=stat일 때 stat_reason을 필수로 해야 한다. is_stat과 StatOrder가 필요하다면 독립 입력이 아닌 결정적 projection으로 만들고, StatOrder를 유지할 경우 priority=stat과의 정확한 동치 및 일관성 제약을 명시해야 한다.
- issue-018 (medium): 주문 가능한 Test, 실행 가능한 Assay, 실제 수행, 입력 Specimen, 산출 Result의 역할과 연결이 정의되지 않아 EMR 주문에서 LIS 실행·결과까지의 의미와 provenance가 끊겨 있다.
  - root cause: Test와 Assay가 동의어인지 서로 다른 추상화 수준인지 결정하지 않아 canonical realization 관계와 수행 provenance가 누락되었다.
  - materiality: 한 Test가 여러 분석 절차에 매핑되거나 Assay가 독립적으로 변경되는 경우 카탈로그 항목, 절차, 검체, 관찰 결과가 잘못 동일시될 수 있다. 이는 어떤 절차가 결과를 생성했는지 추적하고 해석할 수 없게 하므로 EMR 주문을 LIS 실행과 결과로 번역하는 개념 권위라는 목적을 약화한다.
  - action: 다음 단계 전에 Test–Assay 의미 정책을 확정하고, 서로 다른 개념으로 유지한다면 OrderableTest가 하나 이상의 Assay로 실현되는 canonical 관계를 정의해야 한다. 이어 AssayExecution 같은 수행 사건을 도입해 그 수행이 Specimen을 사용하고 Result를 산출하도록 연결하며, Result의 검체 provenance는 derived_from으로 보존해야 한다. 기존 이중 등록은 명시적 매핑 또는 선언된 동의어 정책으로 대체해야 한다.
- issue-019 (medium): Order 완료를 Result.status == final로만 판정하면서 corrected의 종결성을 정의하지 않아, corrected 결과가 존재할 때 Order 완료 상태가 소비자별로 달라질 수 있다.
  - root cause: Result.status를 전이 순서와 finality 속성 없는 평면 enum으로 모델링한 것이 corrected 결과의 주문 완료 의미를 불안정하게 만든다.
  - materiality: 통합 시스템은 동일한 corrected 결과에 대해 Order를 재개방하거나 차단하거나 완료 상태로 유지할 수 있다. 따라서 Order, Result, Report 전반에 일관된 lifecycle 의미를 제공한다는 목적이 훼손되며, 다음 단계 전에 닫아야 할 material issue다.
  - action: 릴리스 전 Result의 허용 상태 전이와 명시적 finality predicate를 정의하고, Order 완료를 enum 리터럴 동일성이 아니라 그 의미적 종결 조건 또는 모든 필수 Result version의 완료 여부에 결합해야 한다. corrected를 종결로 볼지에 대한 도메인 결정을 predicate에 명시하고 Report amendment 동작과 정합성을 검증해야 한다. 또한 dep-002가 가리키는 issue-015와 평면 상태 모델이라는 원인 맥락을 공유하므로, 상태 모델 수정은 중복 규칙이 생기지 않도록 함께 조정해야 한다.
- issue-021 (medium): CriticalValue의 notified 상태가 이를 촉발한 구체 Result occurrence에 연결되지 않아 결과별 통보 완료 상태를 신뢰성 있게 표현할 수 없다.
  - root cause: 재사용 가능한 중대결과 임계 규칙과 occurrence별 통보 상태를 한 엔티티에 두고 Result 관계를 생략한 것이 통보 상태의 귀속을 불가능하게 만든다.
  - materiality: 동일한 Test가 여러 환자·Order의 Result를 생성할 수 있으므로 Test 수준의 notified 값만으로는 어느 결과의 통보가 완료되었는지 구분할 수 없다. 이로 인해 통보 상태가 다른 결과에 잘못 재사용될 수 있고 감사 가능성과 중대결과 안전 책임성이 약화되어, 운영 가능한 EMR/LIS Order-to-Report 통합 모델이라는 목적을 훼손한다.
  - action: 다음 단계 전에 임계 규칙과 critical-result occurrence를 분리하고, 각 occurrence를 이를 촉발한 Result에 연결해야 한다. 또한 occurrence를 완료 여부·시각·수신자를 담는 통보 기록 또는 제한된 외부 기록 참조에 연결해 결과별 통보 귀속과 감사 추적을 보장해야 한다.

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
- issue-014: 렌즈 간 미해결 이견은 없습니다. 다만 ‘동일 정보’가 리터럴 동일성인지 의미적 동등성인지 현재 계약에는 명시되어 있지 않으며, 수정 과정에서 반드시 확정해야 합니다.

## Deliberation Decision
- issue-001: no-deliberation-needed
- issue-006: no-deliberation-needed
- issue-008: no-deliberation-needed
- issue-014: no-deliberation-needed
- issue-015: no-deliberation-needed
- issue-016: no-deliberation-needed
- issue-020: no-deliberation-needed
- issue-002: no-deliberation-needed
- issue-003: no-deliberation-needed
- issue-004: narrowed
- issue-005: no-deliberation-needed
- issue-007: no-deliberation-needed
- issue-009: no-deliberation-needed
- issue-010: no-deliberation-needed
- issue-011: no-deliberation-needed
- issue-012: no-deliberation-needed
- issue-013: no-deliberation-needed
- issue-017: no-deliberation-needed
- issue-018: no-deliberation-needed
- issue-019: no-deliberation-needed
- issue-021: no-deliberation-needed

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- issue-001: EMR/LIS 통합에서 임상의가 신뢰할 수 있고 변경 내성 있는 결과 상태 권위를 제공하는 목적 Source finding context: EMR/LIS 통합에서 임상의가 신뢰할 수 있는 개념 권위 문서를 제공하는 목적 Source finding context: LIS 결과 상태를 EMR 임상의에게 일관되고 변경 내성 있게 전달하는 개념 권위 계약
- issue-006: EMR/LIS가 신뢰할 수 있는 검사 결과·보고 상태와 중대결과 통보 증거를 공유하는 개념 권위 역할 Source finding context: EMR/LIS가 신뢰할 수 있는 검사 결과·보고 상태와 운영 증거를 공유하는 개념 권위 역할 Source finding context: Provide a conceptually valid operational model for immediate critical-result notification across EMR/LIS.
- issue-008: EMR/LIS 통합에서 공유 개념의 우선순위와 권위를 결정하는 문서 역할
- issue-014: EMR/LIS 통합에서 결과 상태의 개념 권위와 교환 계약을 제공하는 목적
- issue-015: EMR/LIS가 동일한 보고서 상태 전이와 최종 임상 표시 상태를 결정하게 하는 개념 권위
- issue-016: EMR/LIS 통합 및 임상의 결과 해석을 위한 개념 권위 문서 역할 Source finding context: Use as the conceptual authority document for EMR/LIS integration and clinician-facing result interpretation.
- issue-020: Order부터 Report까지 EMR/LIS 통합의 개념 권위 역할 Source finding context: Serving as the conceptual authority for EMR/LIS integration from Order through Report.
- issue-002: EMR/LIS 통합의 운영 위험까지 다루는 개념 권위 제공
- issue-003: EMR과 LIS가 공유할 검사 카탈로그 개념 권위 제공
- issue-004: EMR/LIS 사이에서 동일한 워크플로 지표 의미를 제공하는 개념 권위
- issue-005: Order부터 Report까지의 임상검사 workflow를 EMR/LIS 통합의 개념 권위로 제공하는 목적
- issue-007: 검사 항목·수행 단위·위험 임계값을 장기간 일관되게 해석하는 통합 권위 역할
- issue-009: Order부터 Report까지 실제 임상검사 수행 경로를 표현하는 workflow 권위 역할
- issue-010: 다양한 임상검사 결과를 EMR/LIS 간 의미 손실 없이 교환하는 개념 권위 역할
- issue-011: 검사 주문과 실제 수행 항목을 장기간 일관되게 연결하는 개념 권위 문서 역할 Source finding context: EMR/LIS 연동 설계에서 검사 주문과 실제 수행 항목을 장기간 일관되게 연결하는 개념 권위 문서 역할
- issue-012: EMR/LIS 사이에서 검체 요구사항과 실제 검체를 확장 가능한 공통 개념으로 교환하는 계약
- issue-013: 서로 다른 EMR/LIS의 환자·검사·조직·인력 개념을 충돌 없이 연결하고 변경 후에도 추적하는 권위 문서 역할
- issue-017: EMR/LIS 통합을 위한 명확한 주문 우선순위 의미 제공 Source finding context: Provide unambiguous order semantics for EMR/LIS integration.
- issue-018: EMR 주문을 LIS 실행과 결과로 번역하는 개념 권위 역할 Source finding context: Serve as the concept authority for translating EMR orders into LIS execution and results.
- issue-019: 통합 시스템 전반에서 Order, Result 및 Report의 일관된 lifecycle 의미 제공 Source finding context: Provide coherent lifecycle semantics for orders, results, and reports across integrated systems.
- issue-021: EMR/LIS 통합을 위한 운영 가능한 Order-to-Report 개념 모델 제공 Source finding context: Providing an operationally usable Order-to-Report concept model for EMR/LIS integration.

## Final Review Result
21 material issue(s) require attention. Highest-priority issue: issue-001 (high) — Result와 Report에 동일한 임상 상태를 중복 저장하고 Report를 지연 동기화된 권위 값으로 사용하는 현재 모델은, corrected 이후 최신 상태의 신뢰성과 상태 모델 변경 시 의미의 연속성을 모두 보장하지 못한다. Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.

## Boundary Notes
- 야간 배치 구현과 추가 상태 매핑은 이 단위의 증거 범위 밖이므로 기존 보완책의 존재 여부는 확인되지 않았다.
- 외부 전화 기록 대장의 실제 스키마와 보존 수준은 허용된 증거 경계에서 확인할 수 없으며, 존재하더라도 온톨로지의 occurrence identity와 관계 의미 부재를 보완하지 않는다.
- 실제 시스템별 데이터 소유권과 배치 실패 처리 정책은 허용된 증거 범위에서 확인되지 않았다.

## Immediate Actions Required
- issue-001 (high): fix_now
- issue-006 (high): fix_now
- issue-008 (high): fix_now
- issue-014 (high): fix_now
- issue-015 (high): fix_now
- issue-016 (high): fix_now, accept_risk
- issue-020 (high): fix_now
- issue-002 (medium): fix_before_release, accept_risk
- issue-003 (medium): fix_before_release, accept_risk
- issue-004 (medium): fix_before_release, accept_risk
- issue-005 (medium): fix_before_release, follow_up
- issue-007 (medium): fix_before_release, follow_up
- issue-009 (medium): fix_before_release, follow_up
- issue-010 (medium): fix_before_release, follow_up
- issue-011 (medium): fix_before_release, follow_up
- issue-012 (medium): fix_before_release, follow_up
- issue-013 (medium): fix_before_release, follow_up
- issue-017 (medium): fix_before_release, fix_now
- issue-018 (medium): fix_before_release, accept_risk
- issue-019 (medium): fix_before_release, follow_up
- issue-021 (medium): fix_before_release, fix_now

## Recommendations
- issue-022 (low): 명시적 relations 인벤토리가 선언된 reference 링크 전체를 포함하지 않는다. Source finding context: clinical-lab-ontology.yaml — relation inventory completeness Source finding context: materialized-input.md:15-20,46-103,108-119 — several ref attributes are absent from relations, while other ref attributes are duplicated there. Source finding context: The explicit relations inventory is not closed over the ontology's declared reference links. Source finding context: The artifact exposes two inconsistent structural representations. A consumer traversing ref attributes sees a different graph from one traversing the relations list, causing some entities or paths to appear disconnected depending on the ingestion route. Source finding context: Declare one canonical relationship authority and deterministically derive the other representation, or add all missing reference edges to relations and validate that every ref/is_a link is represented consistently. Source finding context: .onto/review/20260718-958e001f/round1/structure.findings.yaml#structure-candidate-003

## Unique Finding Tagging
- issue-022 (low): 명시적 relations 인벤토리가 선언된 reference 링크 전체를 포함하지 않는다. Source finding context: clinical-lab-ontology.yaml — relation inventory completeness Source finding context: materialized-input.md:15-20,46-103,108-119 — several ref attributes are absent from relations, while other ref attributes are duplicated there. Source finding context: The explicit relations inventory is not closed over the ontology's declared reference links. Source finding context: The artifact exposes two inconsistent structural representations. A consumer traversing ref attributes sees a different graph from one traversing the relations list, causing some entities or paths to appear disconnected depending on the ingestion route. Source finding context: Declare one canonical relationship authority and deterministically derive the other representation, or add all missing reference edges to relations and validate that every ref/is_a link is represented consistently. Source finding context: .onto/review/20260718-958e001f/round1/structure.findings.yaml#structure-candidate-003

## Shared Phenomenon Summary
- none
