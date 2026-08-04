# 초안 B 적대 검증 — 렌즈: 구현 실현성과 비용

- 검증일: 2026-07-31 (동일 렌즈 재실행으로 경험 주장 전건 재검증: package.json 의존성, tsconfig exclude, spreadsheet-structure-observer 좌표계·content_sha256 raw-byte, MCP server.ts:1643 switch(name) 디스패치)
- 대상: drafts/draft-B.md 전문 (요약 아님)
- 방법: 초안 전문 정독 + repo 실물 대조 (tsconfig.json, package.json 의존성 실측, spreadsheet-structure-observer.ts 좌표계 실측)
- 종합 판정: **repairable** — 스택은 대체로 실재하고 계승 자산이 크지만, 최고빈도 운영 경로(앵커 재결속)가 플래그 하나로 처리돼 있고, 대표 예시가 선택된 추출기가 생산하지 못하는 술어에 의존하며, 반증 실험이 다형 소스 가정을 반증할 수 없는 fixture로 설계됐다. 전부 고칠 수 있으나 고치지 않으면 M2~M5에서 각각 실비용으로 터진다.

---

## F-1 (high) 앵커 재결속이 최고빈도 연산인데 설계가 "플래그"뿐이다

초안의 evidence는 (path, [start,end), range_sha256, artifact_sha256, epoch) 바이트 구간 앵커다(§2.1). §3.5(b)는 "앵커가 깨지면 커널이 재결속 필요 플래그를 낸다"까지만 말하고, **재결속 자체를 누가 어떻게 하는지**(결정론인가, seat인가, 커널 휴리스틱인가)를 어디에도 정의하지 않는다. anchor-reconcile.ts는 "evidence ↔ 실아티팩트 대조"(§9) — 대조는 검출이지 재결속이 아니다.

실패 시나리오: prettier 일괄 포맷이나 파일 상단 import 하나 추가 → 그 파일의 **모든 후속 span 바이트 오프셋이 이동** → range_sha 불일치 → 그 evidence를 premise로 쓰는 모든 concept/fact/check가 stale. 새 epoch의 R-1 재추출은 새 evidence id를 만들지만, **기존 concept의 justification.premises는 죽은 old-id를 가리킨다.** 이때 선택지는 둘뿐인데 초안은 어느 쪽도 명시하지 않았다: (a) attested 개념이 파일을 만질 때마다 standing에서 굴러떨어져 재판정 큐에 들어간다(LLM 비용 폭발 + standing 플래핑 — 매 커밋이 재판정 트리거), (b) 커널이 이름·kind 매칭 휴리스틱으로 침묵 재결속한다(신뢰 코어에 의미 추론이 들어감 — 초안 자신의 "커널은 추론하지 않는다" 위반). 이 repo의 자기 학습("오프셋은 산술로 안 나온다", "PROVENANCE를 안 보고 다시 재서 틀림" — MEMORY 2026-07-30)이 이미 이 연산의 오류 유발성을 실측했다. 커밋마다 도는 연산의 미설계는 cold-start가 아니라 정상 운영의 구멍이다.

수리: 앵커를 2층으로 — 정체성 키는 심볼 좌표(예: SCIP symbol moniker 또는 path+kind+qualified-name), 바이트 구간은 그 키의 epoch별 속성. 재결속 = 같은 심볼 키의 새 구간을 결정론 재바인딩, 키 자체가 사라졌을 때만 재판정 큐. 이는 evidence 개념의 스키마 변경이므로 M1 전에 확정해야 한다.

## F-2 (high) 대표 entailment가 선택 추출기가 못 만드는 술어(`calls`) 위에 서 있다

§6 표는 scip-typescript 산출을 "defines/references/imports/calls, soundness: sound"로 적었고, §2.3의 유일한 실전 예시 en_1("grant 발급 사이트마다 revoke 경로 도달 가능")은 `pred:"calls"` + reach로 컴파일된다. 그러나 SCIP 인덱스의 실체는 **occurrence(정의/참조/임포트 role) + 심볼 관계**이지 호출 그래프가 아니다. "calls"를 얻으려면 참조 occurrence를 tree-sitter 함수 span과 조인해 "함수 본문 안의 참조 = 호출"로 유도해야 하는데, 이는 (i) 추가 구현이고 (ii) **approx다** — 콜백으로 넘기는 함수 참조, 값 위치 참조가 전부 calls로 오인된다. [확인필요: SCIP occurrence role에 call-site 구별이 있는지 — 내 지식으로는 없다.] 현행 CodeStructureInventory에도 호출 엣지가 없음은 미션 컨텍스트가 명기한 알려진 한계다.

실패 시나리오: M0 실험에서 seat이 저작하는 entailment의 상당수가 자연스럽게 calls/reach 모양이 된다(§2.3이 모범 예시로 그 모양을 보여줬으므로). 커널은 "sound"로 라벨된 approx calls 위에서 forall을 실행 → 콜백-전달을 호출로 세서 카디널리티가 부풀거나, 반대로 동적 디스패치를 놓쳐 attestation이 unsound하게 pass → **30% 문턱 측정치 자체가 오염**된다. tier(producer 유도)와 soundness(라벨)가 분리돼 있어 approx 사실 위 E1 attestation이 허용되는지도 §3.5가 침묵한다.

수리: fact 어휘에서 calls를 v1에서 빼거나 approx로 정직 라벨하고, E1 정의에 "sound 사실 위 실행"인지 "checked-tier(approx 포함) 위 실행"인지 명시. 대표 예시를 references 기반으로 다시 쓰기. M0 측정 항목에 "저작된 entailment의 술어 분포"를 추가해 calls 의존율을 실측.

## F-3 (high) 반증 실험(M0)이 다형 소스 가정을 반증할 수 없게 설계됐다

§12 fixture는 "자기 repo + 외부 TS repo 1개" — 둘 다 TypeScript다. 그런데 sound T2 엣지는 TS에만 있고(§6), 롱테일 14언어는 동일명 휴리스틱 approx, 문서 의미 결속은 claimed다. 즉 **이 실험은 가장 유리한 지대(sound 엣지가 실재하는 유일한 언어)에서만 30% 가정을 시험한다.** R6("하나의 논리 체계가 다형 소스를 같은 지평에")이 미션의 명시 난제인데, 실험이 통과해도 스프레드시트·문서·비TS 코드에서 checked 계층이 앙상하다는 §12의 파국 시나리오는 전혀 기각되지 않는다.

실패 시나리오: M0 PASS(TS에서 35%) → M1~M6 착지 → 실코퍼스(코드+문서+시트 혼합)에 돌리자 문서 유래 개념의 attested 비율 ~0%, 시트는 formula_ref만 — 승격 규칙이 코드 개념만 승격하는 계급 구조가 되고, 초안이 걱정한 "장부 정리된 프롬프트 출력 보관소"가 비코드 절반에서 실현된다. 이때는 이미 이행 비용을 치른 뒤다.

수리: fixture에 스프레드시트 1개 + prose 문서 세트 1개를 추가하고 소스 유형별 통과율을 분리 보고. 문턱을 전역 30% 하나가 아니라 유형별로 사전 등록(코드 30% / 시트 ?% / 문서는 E4-only 예상치 명시).

## F-4 (high) 커널 동결 프로토콜의 발효 시점 미정 — 초기 개발 속도와 정면 충돌

§5.2: 커널 변경 = 제안 레코드 → 이종 frontier seat 2개 blind 영향집합 재유도(DDC-lite) → 사람 마커 + genesis 갱신. 그런데 커널은 M1에서 **신규 작성되는 코드**다. 신규 코드는 첫 몇 달간 주 단위로 버그가 나온다(check-run의 카디널리티 엣지케이스, 앵커 대조 off-by-one 등).

실패 시나리오: M2에서 check-run.ts의 경계 버그 발견 → 프로토콜대로면 한 줄 수정에 frontier 2-seat 디스패치 + owner 비준 의식 → 하루 수 회 반복 불가 → 실제로는 프로토콜을 우회하게 됨 → "채널 구조가 자기승인을 막는다"는 설계의 핵심 주장이 이행기 내내 형해화된 채로 시작한다. 반대로 프로토콜을 지키면 1인 개발 속도가 붕괴한다.

수리: genesis 비준·동결을 M6 flip 시점으로 명시하고, M1~M5의 커널은 일반 리뷰 규율(현행 교차검증)로 운영. 동결 전 원장 항목은 kernel_sha가 유동임을 epoch에 정직 기록. 이 단계 구분이 없으면 프로토콜은 이행기 내내 theater다.

## F-5 (medium) 스프레드시트는 바이트 구간 앵커 모델에 안 들어간다 — 실물 대조 결과

초안 §6은 "같은 지평의 실체는 evidence 앵커 모델(바이트 구간+해시)"이라 선언하고 시트 추출기를 "현행 observer 계승, sound"로 적었다. 실물 대조: `spreadsheet-structure-observer.ts`의 좌표계는 **A1/R1C1 셀 주소·범위**(used_range, applied_ranges, merged_ranges…)이고 content_sha256은 파일 전체 raw-byte 해시다. 바이트 구간 앵커가 아예 없다. xlsx는 zip 컨테이너라 "path+[start,end)"가 가리킬 안정된 바이트 지대가 없다(내부 XML 오프셋은 재압축마다 이동).

실패 시나리오 둘: (a) Excel에서 열고 무편집 저장 → zip 재패킹으로 artifact_sha 변경 → 시트 유래 evidence 전량 stale → 그걸 인용한 claimed 개념 재판정 큐 유입 — 의미 변화 0인데 LLM 비용 발생. (b) 시트 evidence를 만들려면 anchor 스키마에 셀 주소 변형이 필요한데, 정규 개념 evidence가 앵커 다형성을 갖는 순간 커널의 anchor-reconcile·range_sha 대조·수신 영수증 로직이 앵커 유형별로 분기한다 — 초안이 "파서가 아니라 데이터 모델이 일반화된다"고 주장한 바로 그 데이터 모델이 유형별로 갈라진다. 설계 안 된 개념 분할이다.

수리: evidence.anchor를 명시적 합 타입(byte-range | cell-range | heading-path)으로 v1 스키마에 넣고, 유형별 재조정 규칙을 커널 계약에 명문화. artifact_sha는 시트에서 정규화 해시(현행 observer의 reuse digest 접근 계승)로 대체.

## F-6 (medium) tsconfig가 테스트를 제외한다 — E3 축과 coverage 주장이 조용히 깨진다

실물: tsconfig.json exclude = `src/**/*.test.ts` + test-fixtures (기존 학습으로도 확인된 사실). scip-typescript는 tsconfig 프로젝트를 인덱스하므로 **테스트 파일의 참조 엣지가 인덱스에서 빠진다.** 그런데 E3(protection)는 "테스트/게이트 아티팩트가 해당 앵커를 전제로 인용"이고, §2.3의 coverage 예시는 `glob: src/core-runtime/**/*.ts, soundness: sound`를 선언한다.

실패 시나리오: (a) E3 축이 sound 사실로는 항상 0 → supported 판정이 E2 단독으로 좁아지고, "테스트 1개면 supported"(§3.5 (d)의 유일 보안 게이트 방어)가 실제로는 작동하지 않는다. (b) 더 나쁘게, coverage fact가 glob 상 테스트 포함처럼 읽히는 채로 sound 선언되면 absent 질의("이 함수를 인용하는 테스트 없음")가 **면허를 가진 채 오판**한다 — 초안이 구조로 봉쇄했다고 주장하는 바로 그 부재-오판 클래스가 coverage 선언의 정확성으로 되돌아온다. coverage의 정직성을 누가 검증하는가는 초안에 없다.

수리: 별도 tsconfig(테스트 포함)로 인덱스하거나 coverage.scope에서 테스트 제외를 명시 선언. coverage assertion 자체에 검증 절차(인덱스된 파일 목록 대 glob 실측 대조)를 커널 요건으로 추가.

## F-7 (medium) 스택 표의 사실 오류: ajv는 스택에 없다

§8 "JSON Schema + ajv | 이미 스택에 있음(INV-SCHEMA-1·submit 경로), 추가 도입 0". 실물 package.json: ajv 부재, 검증기는 **zod 4.3.6**이다. dependencies에 JSON Schema 계열은 없다. "추가 도입 0" 근거가 거짓이므로 선택지는 (a) ajv 신규 도입 — 초안 논리로는 근거 상실, (b) zod 유지 — 그러면 원장 스키마의 canonical 표현이 JSON Schema가 아니라 zod 코드가 되고, 외부 seat에 보여줄 스키마 산출은 zod 4의 JSON Schema 방출로 해결 가능. 사소해 보이지만 이 렌즈의 핵심 신호다: **스택 표가 설치 실물 대조 없이 작성됐다**는 표본이며, scip-typescript(미설치, protobuf 파서도 미보유 — protobufjs류 신규 의존 필요)의 "즉시·저렴" 주장도 같은 등급의 검증을 요한다.

수리: 스택 표를 package.json 실측 기준으로 정정(zod 채택 명시), scip 파이프라인의 신규 의존(스키마 vendoring 포함)을 도입 목록에 정직 계상.

## F-8 (medium) 1인 유지보수 표면의 정량 부재 — "수백 줄" 계열 추정이 일관되게 낙관

커널 7모듈(§9) + 추출기 5종 + seat 채널 + 재판정 큐 + attribution 분석 배치 + 자기재구축 고정점 테스트 + 이행기 G8/G9/G10 병행. 초안은 이중 러닝 비용을 인정했지만(§13.6) 규모 추정이 없다. M0 커널 프로토타입 "~수백 줄"은 질의 실행기 6프리미티브 + 컴파일러(거부 경로 포함) + fact 그래프 적재 + 변이 배터리(사본 격리) + 카디널리티/음성통제 단언 + 테스트를 포함하면 현실적으로 1.5~3k줄이다. anchor-reconcile은 F-1이 맞다면 diff-추적 서브시스템이라 그것만으로 "사람이 한 자리에서 전수 감사"(§5.2) 상한을 위협한다. 162k줄 현행을 유지하면서 이걸 병행 신설하는 1인 작업의 벽시계 추정(월 단위)이 이행 경로에 없다.

실패 시나리오: M2~M4가 각각 "얇게"의 약속과 달리 수 주씩 걸리고, 그 사이 현행 런타임의 유지 작업(span 전달 후속, MCP 호환)이 계속 유입 → 이행이 중간에 동결돼 두 체계 병존이 상시화 — §13.6이 "이행기"라 부른 순비용이 무기한이 된다.

수리: M별 벽시계·산출 줄수 추정과 중단 기준(예: M3가 N주 초과 시 축소판 재설계)을 이행 경로에 사전 등록. 커널 상한 수치를 "이행 중 확정"으로 미루지 말고 M1 진입 조건으로.

## F-9 (low) claimed 층 coarse 회전 × 활성 개발기 = 반복 전량 재저작 비용

§7: 프롬프트 템플릿/모델/effort 변경 시 claimed 전량 stale — silent-stale 봉인으로서 옳다. 그러나 M2~M5는 정확히 프롬프트를 반복 수정하는 기간이다. 실패 시나리오: 후보 저작 프롬프트를 한 줄 고칠 때마다 개념 수백 건 × entailment 저작까지 재큐 → 예산 큐가 상시 포화 → standing 투영이 "재판정 대기"로 도배돼 lexicon 뷰가 수렴하지 않는다. 수리: 개발기 한정 "프롬프트 세대 핀 + 명시 재저작 배치" 운영 규칙을 이행 경로에 추가(봉인 완화가 아니라 회전 시점의 배치화).

## F-10 (low) 시트 formula_ref "sound" 과잉 선언

INDIRECT/OFFSET 동적 참조, IMPORTRANGE, Apps Script 유래 참조는 결정론 name resolution 밖이다. "셀 참조는 결정론"은 정적 참조에만 참. 실패 시나리오: INDIRECT 기반 시트에서 참조 부재를 sound coverage로 오판 → absent 질의 면허 오발급. 수리: formula_ref를 static=sound / dynamic=approx로 이원 라벨.

## F-11 (medium) 데이터 파일 경유 소비가 전 추출기에 비가시 — noise 오강등의 복권 트리거가 구조적으로 안 울린다

이 repo의 실제 소비 배선 상당수는 코드 참조가 아니라 **데이터 파일 적재**다: `.onto/roles/*.md` 렌즈 role, `core-lens-registry.yaml`, 계약 레지스트리 — 런타임이 경로 문자열로 읽어 행동이 바뀐다. §6 표의 어느 추출기도 "코드가 이 데이터 파일을 적재해 소비한다"는 엣지를 만들지 않는다(설정 추출기는 스키마 키↔읽기 지점 결속, prose 구조 추출기는 문서 내부 구조만). 따라서 데이터 파일로만 실현되는 개념은 E2=0이 체계적이고, E4(describes)마저 없으면 §3.5의 noise 규칙(cited-only 3 epoch ∧ ¬E4 → 자동 강등)에 걸린다.

실패 시나리오: 렌즈 role 산문에만 실현된 개념(예: 특정 렌즈의 judgment_anchor 규약)이 cited-only로 3 epoch 경과 → 자동 강등. 초안의 방어(§3.5(c): "소비자 출현 시 복권")는 **소비자가 fact 그래프에 나타나야** 작동하는데, 그 소비는 추출기 커버리지 밖이라 영원히 나타나지 않는다 — 복권 트리거가 구조적으로 불발이고, 실사용 중인 개념이 침묵 강등된 채 유지된다. 이는 초안이 봉쇄했다고 주장하는 침묵 강등 클래스의 재발이며, 오판 원인은 규칙이 아니라 사실층 커버리지 홀이다.

수리: (a) 리소스-적재 엣지 추출기 추가 — 코드의 경로 리터럴/glob 적재 사이트 → `links_to`(approx) fact. (b) noise 자동 강등의 전제에 "해당 앵커의 소스 유형에 대해 소비-엣지 커버리지가 선언돼 있을 것"을 추가 — coverage 없는 유형에서는 강등이 아니라 공시. 부재-판정에 coverage 면허를 요구한 초안 자신의 규율(§6 규율 a)을 강등 판정에도 대칭 적용하는 것이므로 설계 정신과 합치한다.

---

## 시도했으나 초안이 견딘 공격

- **JTMS 자작 규모**: premise가 monotonic id 참조뿐이라 IN/OUT 투영은 사실상 도달성 fold — "수백 줄" 주장이 이 축소판에서는 성립한다. TS TMS 라이브러리 부재는 저자가 [확인필요]로 정직 표기.
- **원장 스토어 선택**: git+JSONL은 단일 사용자 규모에서 옳고, 전용 스토어 기각 근거 타당. 컴팩션 미설계는 §13.4가 이미 자인.
- **전량 재구축 escape hatch**: "증분은 최적화지 정합성 조건이 아니다"(§7) — 242파일 규모에서 재추출 전량은 수십 초 급이라 Salsa 이식 실패가 치명이 아니다. R5 비판의 상당 부분을 이 한 문장이 흡수한다.
- **수신 영수증 실현성**: range 전달·재조정·영수증은 이번 트랙에서 라이브 실증됐으므로(라이브 프로브 PASS) 신규 리스크 아님. MCP 표면 재정렬 비용은 §손실(5)가 자인.
- **entailment 저작 병목·장부 관료제 비용·30% 가정 자체**: 전부 §13에서 저자가 선점 — 못 다뤘다는 지적 불가. 내 지적은 그 측정(M0)의 설계 결함(F-2·F-3)에 한정했다.
