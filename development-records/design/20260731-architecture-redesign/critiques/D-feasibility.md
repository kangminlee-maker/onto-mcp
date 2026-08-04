# 초안 D 적대적 검증 — 렌즈: 구현 실현성과 비용

- 검증일: 2026-07-31 (재검증 병합본 — 선행 패스의 실측 주장을 독립 재확인한 뒤 신규 발견을 병합했다)
- 검증자 자세: 반박. 초안 전문(drafts/draft-D.md)을 읽고, repo 실물·npm 레지스트리 실측으로 대조했다.
- 종합 verdict: **repairable** — 실현성 렌즈에서 구조적으로 못 고치는 결함은 찾지 못했다. 다만 (i) R5(증분성)의 LLM 계층이 진화 케이던스와 충돌하고, (ii) 닫힌 predicate 어휘 아래 열린 query 어휘가 숨어 비용 산정의 최대 항이 누락됐으며, (iii) 비-TS 소스의 판별력 빈곤이 초안 자신의 사망 조건과 겹친다.

## 실측으로 확인한 사실 (판정의 근거)

1. **npm 레지스트리 실측 (2026-07-31, 2회 독립 확인)**: `@sourcegraph/scip-typescript` 실재. **`@sourcegraph/scip`은 404 — 존재하지 않는다** (`npm view` 직접 실행). 초안 §8이 "확인필요"로 정직 표기한 항목이므로 "못 다뤘다"는 지적은 무효 — 대신 확인 결과를 비용 항목으로 확정한다(F4).
2. **reuse key 실물 (재확인)**: `src/core-runtime/reconstruct/authored-artifact-reuse.ts` `sourceObservationsReuseSha256` — reuse key는 identity 전체의 `sha256Text(stableJson(reuseKey))` 단일 해시다. 여기에 registry_sha를 fold하면(§7 4행) registry가 1바이트라도 바뀔 때 모든 LLM 저작물의 reuse가 무효가 된다(F1).
3. **G11 실물**: `scripts/check-graceful-signal-rethrow.ts` = **649줄** — 초안 §2.1 사례 2(GT-C1/GT-C2)가 인용하는 `typed_terminal_catch_sites` query와 `structurally_rethrows` property의 현행 구현이 단일 check에 이 규모다(F2).
4. **인벤토리 실물**: code-structure-observer — spans/hierarchy/imports(opt-in)/content_sha256/extractor_logic_sha256/extraction_tier. 초안의 현행 서술은 정확하다.
5. **`required_when_predicate_catalog` 실재**: registry-verification-validation.ts:56 등에서 확인. predicate catalog 일반화의 원형이 실재한다는 주장은 사실이다.
6. **`reviewMaterialGoals` 실물**: target-material-kind.ts:522 — spreadsheet만 obligation 보유, 타 kind `[]` (target-material-kind.test.ts:166). 초안 §4(a)의 불균형 서술은 정확하다.
7. **spreadsheet-structure-observer.ts (~2,800줄)**: 셀·시트간 참조의 결정론 해소 실재. §6 표의 spreadsheet=resolved 주장은 실물로 성립.
8. **reconstruct-contract-registry.yaml 188,945바이트**, core-lens-registry 실재. 초안 (b) 패턴 검증의 물적 근거 성립.

## Findings (심각도순)

### F1 [high] R5의 LLM 계층 증분성은 진화 케이던스에 의해 자기파괴된다

§7은 "규칙 1개 변경 시 — check 전수 재평가(싼 결정론) + 뒤집힌 것의 판정만 큐"라고 주장한다. 이것은 **기존 판정 아티팩트**에 대해서만 참이다. 미래 run의 reuse에 대해서는 §7 4행이 스스로 말한 대로 registry_sha·catalog_sha가 reuse key에 fold되고, 실물 reuse key는 전체-identity 단일 해시이므로(실측 2), **승격 1건 = registry_sha 회전 = 다음 reconstruct/review에서 LLM 저작물 재사용 0**이다.

구체적 실패 시나리오: 자기진화 루프가 정상 작동할수록(주당 승격 2~3건) 매 승격이 전 LLM 캐시를 냉각시키고, "소스 1파일 변경 시 변한 것만"이라는 §7의 효과 문단은 registry가 그 사이 한 번이라도 바뀌었으면 성립하지 않는다. 현행 최대 비용 항(렌즈×라운드 LLM 호출)이 "변한 것만"으로 준다는 §7의 결론이 진화가 활발할수록 거짓이 된다 — **미션이 성공할수록 R5가 실패하는 역설**.

repair: fold 단위를 registry 전체 sha가 아니라 **그 스테이지 프롬프트에 실제 투영된 개념·check 부분집합의 해시**로 좁힌다(G8 prompt-projection 패리티 게이트가 이미 투영 표면을 알고 있으므로 접합점이 실재한다). identity folding 관례 안에서 가능하나, 이것은 관례의 확장이 아니라 투영 의존 그래프라는 신규 기계다 — 6–9k줄 추정에 미계상.

### F2 [high] 닫힌 predicate 어휘가 열린 query/property 어휘를 숨긴다 — 비용 산정의 최대 누락 + S0 회색 지대

§2.2 "predicate 어휘 7종은 TS evaluator 수백 줄이면 충분"(§8)은 predicate 셸(count_floor, all_of_kind_satisfy 등)에만 참이다. 초안 자신의 예시(§2.1 사례 2)가 인용하는 args — `query: typed_terminal_catch_sites`, `property: structurally_rethrows` — 는 predicate가 아니라 그 아래의 **bespoke 결정론 분석기**이고, 현행 실측이 단일 check에 649줄이다(실측 3). 즉 catalog는 predicate 수준에서만 닫혀 있고 query/property 수준에서 열려 있다. 귀결:

- LLM은 evaluator에 구현이 없는 query를 인용한 check를 초안해도 fail-closed unknown으로 기각된다(초안 자신의 규칙). 따라서 **승격 가능한 개념 공간은 사전 구축된 query 라이브러리에 상한**이 걸린다 — span 이름/kind 패턴·엣지 카운트·import glob으로 표현되는 check만 사람 손 없이 나온다.
- query 라이브러리 확장 = 사람 코딩 + catalog 변경 = G4 마커(§5.2 코-플립 봉인). "논리 체계가 스스로 진화한다"의 실제 속도가 **개념당 사람 dev 세션**에 묶인다.

구체적 실패 시나리오: S5 첫 도메인 승격에서 의미 있는 불변식 후보들("terminal signal은 재throw되어야 한다"류)이 전부 미구현 property를 인용해 unknown 기각되고, 승격되는 것은 `count_floor(files_matching_glob)` 수준의 빈약한 check뿐. 승격률 >0이라 S0 kill-switch(승격 ≥1 ∧ review 델타)는 통과하는데 승격 개념의 판정 기여는 미미 — **죽지도 살지도 않는 회색 지대**를 S0 판정 기준이 성공으로 분류한다. §12.4가 실패 데이터에 "check 표현 불가?"를 분리 항목으로 둔 것은 사실이나, (a) 표현 가능/불가의 경계가 query 라이브러리라는 비용 구조, (b) 6–9k 산정에 이 라이브러리가 없다는 점, (c) 회색 지대 오분류는 미다룸.

repair: (i) query/property id도 catalog에 닫힌 목록으로 등재하고 각각 owner 구현 경로를 결속(concept-registry consumers 패턴의 재귀 적용). (ii) 초기 어휘를 "인벤토리 사실의 조합 대수로 bespoke 코드 없이 평가 가능한 부분집합"으로 명시하고 그 밖은 claimed 잔류 선언. (iii) S0 지표에 **표현-기각률**(어휘 밖 기각 후보 비율) 추가 — 높으면 회색 지대 신호. (iv) query 항목당 ~100–650줄(G11 실측 범위)로 재산정.

### F3 [high] 판별력 게이트의 실효 범위가 TS+스프레드시트에 편중 — 사망 조건(§12)과 겹친다

§6 표는 정직하다(soundness 티어 명시). 그러나 그 귀결이 비용화돼 있지 않다: `edge_exists`·`no_inbound_edges`는 resolved 티어 전용이고, resolved는 **TS(scip)와 스프레드시트뿐**이다. 정밀 14언어는 import 문자열 수준(모듈 granularity), 문서는 "후속", 롱테일은 claimed 전용. 닫힌 어휘 7종에서 비-resolved 소스에 판별력을 낼 수 있는 것은 span_exists·count_floor·field_backed 정도로 줄고, span_exists는 앵커 실존일 뿐이라 변이 배터리는 통과해도 개념의 규칙성을 판별하는 힘이 약하다. 변이 연산자(span 셔플·엣지 절단)도 코드 형상이라 스프레드시트·문서용 변이 연산자는 미정의다.

구체적 실패 시나리오: Python/Go 코퍼스나 문서 중심 도메인을 reconstruct하면 후보 개념 대부분이 호출·참조 구조에 결속돼 있는데 그 티어에는 엣지가 없어 check ≥1 조건을 못 채운다 → 승격률이 소스 종류에 따라 구조적으로 0에 접근 → §12 사망 조건이 seed 품질이 아니라 **어휘×티어 커버리지** 때문에 발동하고, 초안은 이를 seed 결함으로 오진해 잘못된 기각 데이터를 재작성 진영에 넘긴다. 부수: S0 재료가 전부 TS/자기 repo 축(최우호 소스)이라 이 리스크를 S0가 측정하지 않는데 S0 통과가 S1~S7 전체를 승인한다.

repair: S0 판정 지표에 **소스 티어별 승격률 분해**를 넣어 원인 귀속(어휘 표현 불가 vs 앵커 부재 vs seed 공허)을 강제하고, S0에 비-TS arm 1개 추가 — 최저비용은 스프레드시트(observer가 이미 결정론 참조를 산출하므로 신규 코드 거의 0). 비-TS 언어의 근사 엣지(grammar별 호출/참조 노드 쿼리)는 언어당 부채로 명시 계상하거나 해당 티어 승격 기대치에서 선공제.

### F4 [medium] scip 소비 바인딩 부재 확정 — 소비 경로를 손수 만들어야 한다 (npm 404 실측)

초안이 "확인필요"로 표기한 `@sourcegraph/scip` npm 바인딩은 **존재하지 않는다**(실측 1). indexer CLI는 실재하므로 인덱스 생성은 문제없으나, protobuf 인덱스 소비는 (i) scip.proto vendoring + protobufjs 코드젠 직접 파싱, 또는 (ii) Sourcegraph의 Go제 `scip` CLI 셸아웃 JSON 변환(존재·형식 확인 필요) 중 택일이다. 어느 쪽이든 수백 줄~1–2k줄 + proto 버전 핀 + scip-typescript 출력 스키마 추종이라는 지속 부채. "protobuf 파싱은 경량"(§8)은 파싱 자체엔 맞지만 SCIP symbol 문법 해석(symbol→파일/span 매핑)까지 포함하면 그보다 무겁다.

repair: S0 산출물에 "소비 경로 선택 + 실물 핀"을 명시 결정 항목으로 넣는다(S0가 이미 겸용 목적이므로 구조 변경 불요 — 6–9k 추정에 무게만 반영).

### F5 [medium] §7의 세밀 캐시 키(엣지 resolve)는 채택 도구가 제공하지 않는다

scip-typescript는 프로젝트 전체 인덱싱(tsc 래핑)만 한다 — per-file 증분 모드 없음, 빌드 가능한 워크스페이스(유효 tsconfig + 설치된 node_modules) 필요. §7 2행의 "대상 파일 해시 × import 폐쇄 집합 해시" 캐시는 도구가 주지 않으므로 직접 증분 resolver를 만들거나(대형 비용) "보수 폴백 = coarse 에포크"(파일 1개 변경에도 전체 재인덱스)로 산다. 자기적용 규모(242파일)에서는 tsc 1회 비용이라 수용 가능하나, large-input/멀티레포 로드맵과 정면 충돌 — 대형 코퍼스에서 엣지 티어의 R5는 사실상 없다. 부수: reconstruct의 일반 타깃은 빌드 불성립 repo·관찰 grant 스팬만 받은 소스일 수 있어 resolved 티어 자체가 성립 불가하고, 성립시키려는 임의 타깃 의존성 설치는 공급망 실행 리스크다 — resolved가 항상 성립하는 타깃은 사실상 자기적용뿐.

repair: §7 표에 엣지 티어의 실효 키가 "coarse 에포크(전체 재인덱스)"임을 정직 기재하고 세밀 키는 병목 실측 후 항목으로 강등(§8의 자기 원칙과 동형). §6 표의 TS resolved 행을 "빌드 성립 확인된 타깃 한정"으로 강등하고 인덱스의 미해소 심볼 비율을 soundness 라벨 입력으로 결선.

### F6 [medium] S0 프로브의 앵커 시점 정합 미설계 — 프로브가 자기 자신을 오염시킨다

§12는 보존된 실 run 아티팩트 ≥2벌 위에서 replay하되 scip 인덱스는 현행 checkout에서 1회 생성한다. 보존 seed의 앵커(content_sha256)는 그 run 시점 커밋에 핀돼 있고 repo는 그 후 계속 움직였다(run.ts 21,576→4,966줄 등 대규모 이동 실측). 현행 checkout 위에서 span_exists를 평가하면 앵커 다수가 개념 결함이 아니라 **시점 불일치로** FAIL한다.

구체적 실패 시나리오: 시점-불일치 FAIL이 "check 표현 불가"로 계상돼 승격 0 → §12.4 기각 분기("가정 반증 — 초안 기각")가 오발동. kill-switch 결정 지점이므로 오염의 대가가 초안 전체의 운명이다.

repair: 프로브 절차에 "각 run 아티팩트의 핀 커밋으로 git worktree checkout → 그 시점 소스 위에서 인벤토리·scip 인덱스 생성"을 명시. 싼 수정이고 결정론 replay 규율과 일치.

### F7 [medium] 재판정 큐·시효 강등에 소비자가 없다 — 초안 자신의 declared≠wired 클래스 재발

§5.4의 재판정 큐는 "공시하고 큐에 넣는다"까지만 설계돼 있다. 누가, 어떤 예산으로, 어떤 우선순위로 소진하는지 미지정 — 소비자 없는 큐는 초안이 §1에서 실패 클래스로 규정한 "선언 표면과 강제 표면의 분리" 그 자체다. §5.5의 시효 자동 강등("N일 무소비 → planned")도 '소비'의 측정 기계가 없다: 소비자 목록은 정적(G12 검사 가능)인데 "N일"은 시간축 텔레메트리를 요구하고 그런 텔레메트리는 현행에 없으며 신설 비용 미계상.

구체적 실패 시나리오: 6개월 후 큐에 수백 건이 쌓이고 아무도 소진하지 않아 "당시 규칙 아래 판정"과 현행 규칙의 괴리가 공시 파일 하나에 침전 — 감사 가능하나 실효 없음. 초안이 비판한 lexicon 소비자-0과 동형.

repair: 큐 소진을 기존 표면에 결속 — review 실행 시 대상 아티팩트에 걸린 큐 항목을 같은 run에서 우선 재평가(결정론 check 재실행은 무료에 가깝다), LLM 재판정은 명시 opt-in. 시효 강등은 시간축을 버리고 "커밋 시점 정적 소비자 0"으로 정의를 낮추면 G12만으로 강제된다.

### F8 [medium] INV-SELF-1은 현행 reconstruct가 전-repo 규모를 수용한다는 미확인 전제 위에 있다

§5.3은 비용(주기 벤치·INV-BENCH-1)은 다뤘지만 **성립성**은 안 다뤘다. large-input 트랙의 실측 착지는 S1(큰 파일)·S2(여러 파일)까지이고, 242파일/162k줄 단일 run ingest의 성공 기록은 없다. 오히려 walk cap이 root manifest를 매장해 census가 비었던 실측 전례가 있다(20260721 트랙). 관찰 단계가 전-repo에서 절단되면 하한 박제(첫 실행 PROVENANCE) 자체가 불가능하고, 절단된 관찰 위에서 박제되면 하한이 오염된 기준선이 된다.

구체적 실패 시나리오: S7 첫 자기재구축에서 투영 예산 천장(~8개 — §10 정직 항목 4가 상속을 자인)이 242파일 중 일부를 침묵 강등 → wired 재발견율 floor가 낮은 값으로 박제 → 이후 진짜 퇴행이 floor를 안 깨는 공허 게이트.

repair: S7 전에 성립성 프로브 분리 — 관찰 단계만(LLM 최소) 전-repo 실행해 census 완전성(인벤토리 파일 수 = git ls-files 수)을 결정론 확인. 미달이면 캡/예산 조정이 INV-SELF-1의 선행 의존임을 이행표에 명시. 첫 박제 값에 census 완전성 증빙 동봉.

### F9 [low] "code/document의 obligation 공백을 채운다"는 document/config에서 과대 주장

§4(a)의 판매 문구와 §6의 정직 표("문서 추출은 후속, 의미 결속은 claimed")를 합치면: document kind에 컴파일 가능한 obligation은 사실상 0이거나 자명한 앵커 검사다. S6 flip의 실질 수혜는 code(그것도 F5에 따라 TS 중심) 한 kind이고 spreadsheet는 이미 6개 보유라 델타가 아니다. 문서 추출기 비용(md 구조 추출+앵커 규약+테스트)은 6–9k 산정에 없다.

repair: 이득 주장을 kind별로 분해 명시(code(TS): 실질 / code(비TS): syntactic 한정 / spreadsheet: 기존 유지 / document·config: 후속 추출기 전제)하고 문서 추출기를 예산에 계상하거나 범위 밖 선언.

### F10 [low] 6–9k줄 추정은 이 repo의 테스트 관례를 미계상 — 실질 1.5–2×

구성요소 합산(registry loader+G12 ~1k, evaluator+정확-집합 테스트 ~1–1.5k, promote-seed+변이 배터리 ~1k, scip 소비 1–2k[F4], obligation 컴파일+스키마 증분 ~0.5–1k, 원장+영향 질의 ~0.5k, INV-SELF-1 하니스 ~0.5k)은 운영 코드만으로 6–9k에 걸치나, 이 repo의 규율(테스트 216파일, 정확-집합·음성 대조·fail-closed 테스트 의무 — 초안 자신이 S2·S3 게이트로 요구)을 감안하면 총 10–15k줄이 현실적. F1의 투영 의존 추적과 F2의 query 라이브러리가 추가되면 더 커진다. 구조 문제가 아니라 기간 추정(1인 기준 수 주 → 두 달급)의 문제.

repair: "운영 코드 6–9k + 테스트·픽스처 별도"로 정직 분해하거나 총량 재추정.

### F11 [low] INV-SELF-1 주기 벤치의 실행 비용·케이던스 미지정

전체 self-reconstruct 1회 = 242파일 코퍼스 실 LLM 파이프라인 완주(600s/dispatch 데드라인 실측 감안 시 시간 단위 wall-time + 상당한 토큰 비용). INV-BENCH-1 적용 시 1회가 아니라 3회. 케이던스·예산 상한 미지정이라 1인 운영에서 "실행 안 하는 불변식"으로 퇴화할 위험 — 실행 안 하면 자기파악의 반증 가능 완료 기준이 명목화된다.

repair: 케이던스를 트리거 기반으로 정의(예: registry 세대 갱신 시 1회), INV-BENCH-1 반복 요건은 하한 박제 시점에만 적용, 이후 단회 회귀 운영.

## 시도했으나 초안이 견딘 반박

- 외부 추론기 비채택이 어휘 성장 시 발목 아닌가 → §8이 병목 실측 후 Soufflé 최소 실험으로 이미 다뤘다. 무효.
- 재판정 자동 실행이 LLM 비용 폭발을 일으키는가 → §5.4가 자동 재판정을 명시 배제하고 큐+공시로 라우팅. 비용 통제 구조는 성립(잔여는 큐 소비자 부재 — F7).
- INV-SELF-1이 커밋 게이트가 되어 CI를 잠그는가 → 주기 벤치·INV-BENCH-1 규율로 선제 차단. 성립.
- strata/violated_check 스키마 증분이 기존 아티팩트를 깨는가 → additive·결여=claimed 규약 명시, S4 게이트에 하위호환 diff 포함. 성립.
- 승격 diff staged-only가 실제로 쓰기 경로 부재인가 → 현행도 seed는 run 디렉터리에만 쓴다는 서술이 repo 구조와 부합. 성립.
- lens-registry 패턴 일반화가 실재 패턴인가 → lens-registry.ts·`definition_sha256`·`required_when_predicate_catalog` 전부 실물 확인. 성립.
- 문서·스프레드시트를 손으로 흔들었나 → 스프레드시트 참조 해소는 실물 확인, 문서의 claimed 잔류는 §6이 명시 시인. "다뤘다"로 판정 — 단 그 귀결의 비용은 F3·F9로 지적.
- (정정) "무거운 것은 evaluator가 아니라 엣지층뿐"이라는 선행 패스의 판정은 **불충분** — 엣지층(F4·F5)에 더해 query/property 층이 별도의 최대 비용 항이다(F2, G11 649줄 실측).

## 판정

**repairable.** 근본 구조(검증된 패턴의 적용 범위 확장, 가역 이행, kill-switch)는 실현성 렌즈에서 무너지지 않는다. 그러나 F1·F2·F3은 비용·속도 주장의 재산정을 요구하며, 특히 F2는 방치 시 "스스로 진화"가 개념당 사람 코딩에 묶여 미션의 핵심 주장을 조용히 잠식하고, F1은 미션이 성공할수록 R5가 무너지는 역설을 낳는다. S0 프로브는 F2(표현-기각률)·F3(티어별 분해·비-TS arm)·F4(소비 경로 핀)·F6(시점 정합)을 반영해 확장해야 kill-switch로서 유효하다.
