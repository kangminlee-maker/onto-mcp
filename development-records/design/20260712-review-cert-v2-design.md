# review-cert/v2 — resubmit-enabled 측정 + 사용량 공개 지표 (2026-07-12)

상태: v1 초안 — owner가 "cert v2 결정 먼저"를 지시(2026-07-12). 다관점 검증 전.
상위: 20260711-review-role-registration-design.md §4(M-1 재정의 대상),
20260712-format-rescue-ladder-design.md §4-5(resubmit 확정·기각 기록).

## 1. 결정의 내용

cert가 재는 대상을 "모델 원(原)계약준수(rescue OFF)"에서 **"제품 실경로
신뢰성(resubmit ON, salvage OFF)"**으로 옮기고, 원계약준수는 게이트가 아닌
**공개 지표(resubmit 사용률)**로 강등한다. 근거: production 확정 경로가
resubmit ON(52d18bc·format-rescue-ladder §2)이므로, 등록 판정은 실제 운용될
경로에서 측정해야 하고(측정-운용 정합), 무피드백 재시도 하의 완주율은
스테이트리스 워커 구조에서 모델 능력의 공정한 대리변수가 아님이 실측됨
(동일 반려 3회 반복 — stance-rejection-diagnosis.md).

- salvage는 v2에서도 OFF 유지: 전사 개입은 품질 축의 저자 귀속을 흐림
  (salvage-first 기각 사유와 동일 계열). `salvaged_unit_ids=[]` 행 증거 유지.
- 행(ok) 판정 기준 불변: 완전 완주 + 12-check 전체. 강등(complete-with-
  failure)된 유닛이 있는 run은 여전히 not_run — resubmit의 가치는 오답노트
  재시도가 예산 내에 실제로 고치는 것으로만 인정된다.

## 2. 변경 명세

### 2.1 contract 상수·스키마 (review-cert-record.ts)

- `REVIEW_CERT_CONTRACT = "review-cert/v2"` (:32). v1 record는 parse 대상에서
  제외됨 — 안전: v1 record 2건(sol FAIL 8c845c7, fable5 rep_floor)은 모두
  실패 증거로만 존재하며 어떤 registry entry의 benchmark_evidence_refs에도
  인용되지 않음(구현 시 grep으로 재확인 — 인용 발견 시 fail-loud로 중단하고
  owner 확인).
- run_controls 규칙(:355-358) 교체: v2는
  `salvage_enabled=false AND resubmit_enabled=true`를 요구(리터럴 pin,
  기존과 같은 fail-loud 스타일·반대 극성). 위반 코드 `run_controls` 재사용.
- 행 스키마에 `resubmit_applied_units: number` (int ≥0) 추가 — 그 행에서
  오류명세 주입 재시도가 적용된 유닛 수. not_run 행도 기록(진단 가치).
- record에 `resubmit_disclosure` 추가(비차단 공개 지표 — floor 없음):
  `{ per_arm: { baseline: {applied_units, units_total}, candidate: {...} } }`.
  validator는 rows에서 재계산해 일치만 검증(단일 계산 권위 패턴 재사용,
  computeReviewCertAggregates와 동형). 불일치 위반 코드는 기존
  `aggregate_mismatch` 계열 재사용.

### 2.2 resubmit 사용량의 결정적 수집 (원천→record 배선)

1. runner: 재시도 루프에서 `applyResubmitErrorSpec`가 true를 반환한 유닛을
   집계 → `ReviewUnitExecutionResult`에 `resubmit_applied: boolean` (또는
   적용 횟수) 추가 — 이미 루프가 반환값을 알고 있어 1지점 배선.
2. benchmark 리포트: run summary에 `resubmit_applied_unit_ids: string[]`
   (기존 `salvaged_unit_ids` 명명 패턴 미러) — unit results에서 투영.
3. cert 하니스 rowFromAttempt: `resubmit_applied_units = ids.length`를 행에
   기록. ok 판정에는 불참여(공개 지표).

### 2.3 cert 하니스 (review-cert-run.mts)

- 시작 단언 교체: salvage 기본 OFF 단언 유지 + **양 arm benchmark 호출에
  `--retry-resubmit` 전달**(v2에서는 노브가 아니라 계약 — 하니스가 항상
  전달, CLI 옵션 아님). run_controls 선언 `resubmit_enabled: true`.
- `salvaged_unit_ids=[]` 행 검증 유지(살vage 핀의 행 증거).
- reproduction command에 v2 계약이 드러나도록 유지(자동 — 인자 불변).

### 2.4 설계 SSOT 정정

20260711-review-role-registration-design.md §4 M-1에 일자 명기 정정 추가:
"M-1(원측정 핀)은 v1 한정. v2는 resubmit ON을 계약으로 선언하고 사용률을
공개 지표로 기록(본 문서 참조)". INV 마커 필요 여부는 구현 시
check:invariant-change 게이트로 판정(INV-CFG-1 간접승인 규약 적용 가능).

### 2.5 G7/registry

registry 인용 규칙(:534)은 상수 참조라 v2로 자동 추종. G7 recompute는
validateReviewCertRecord 경유이므로 추가 배선 없음(구현 시 G7 스크립트가
contract 리터럴을 별도 하드코딩하지 않는지 grep 확인).

## 3. 검증 계획

- 단위: run_controls 규칙 반전(양성/음성), resubmit_disclosure 재계산
  일치/불일치, 행 스키마 왕복. 기존 record 테스트의 v1 리터럴 갱신.
- assemble/record 전체 스위트 + mock 리허설 1회(하니스 e2e — synthetic
  경로에 disclosure 필드 관통).
- fresh cert run은 본 설계 구현+검증 후 owner 지시로 실행(H3 계약 지문은
  선택적 동반 구현 — §4).

## 4. 동반 권고 (선택, owner 결정)

- **H3 최소형**: record에 `contract_fingerprint`(예: 코드 커밋 sha 또는
  K1 이후를 식별하는 상수)를 추가하고 resume 시 불일치 거부 — "계약 변경
  전후 행 혼합" 재발 방지. v2 스키마 신설과 같은 diff에 넣으면 한계비용 최소.
- 준승인 tier 표기는 별도 결정(v2 record가 그 입력).

## 5. 다관점 검증 판정 (v1 초안 → v2 개정, 2026-07-12; fable 4-렌즈 + 실코드 재검증)

같은-모델 리뷰(공유 맹점 가능)임을 명기. 구조 축은 4렌즈 전원 clean 확증:
계약 상수 flip의 G7 자동 추종, registry 무인용(승격 무파손), M-1 재정의 건전
(salvage 오염 논거는 resubmit에 무해당), **codex/claude 대칭 확증**(검증·freeze
가 route 무관 부모측 공유 경로 — 양팔 공정성 성립), 강등 유닛의 ok 밀반입
불가. 아래는 §2/§4를 대체하는 개정 사항.

### 5.1 disclosure는 저장하지 않는다 (lens4-F1, lens1-F4/F5)

`resubmit_disclosure` 저장+재계산검증(§2.1) **기각** — 이 모듈의 비차단
규약은 "저장 없이 read-time 투영, WARN 소비"(`reviewCertQualityDisclosures`
:284-302, 소비 check-supported-models:269·review-cert-run:876)이며, 저장+
`aggregate_mismatch`는 비차단 선언 지표를 실제로 차단하게 만든다. 개정:
- 행 원자 필드만 저장: `resubmit_applied_unit_count: number`(int≥0, required
  — 명명은 벤치 `salvaged_unit_count`(:215) `_count` 규약 준수, lens4-F2).
- record-수준 사용률은 `reviewCertResubmitDisclosure(record)` 투영 함수
  (동형 패턴, validate 미참여, WARN 소비)로: **ok 행과 not_run 행을 분리
  집계**(ok 행 rate = 실제 완주에 기여한 사용량; not_run 행 카운트는 진단
  병기 — "발화 총량"과 "고친 양"의 혼동 방지, lens3-F1). 분모는 ok 행
  units_total 합(placeholder 오염 없음 — not_run의 fallback 1은 분모 불참).

### 5.2 배선은 8~10좌석, 루프-스코프 누적 필수 (lens1-F2, lens3-F3, lens4-F5)

§2.2.1 "1지점 배선" **정정** — `applyResubmitErrorSpec` 반환 boolean은 현재
두 호출부(:4104, :4165)에서 폐기되며, resubmit은 실패 iteration에서 발화하고
성공 return은 다음 iteration이므로 **루프 진입 시 `let resubmitApplied` 누적
(`||=`) 후 성공(:4134)·실패(:4305)·salvage(:4266) 반환 전부에 접기**가 필수
(누적 없으면 "고친 케이스"가 체계적 0 집계 → 지표 정반대 왜곡). 경로:
`ExecutionOutcome` 신규 필드 → `toUnitExecutionResult`(:2687) →
`ReviewUnitExecutionResult` → execution-result.yaml → benchmark
`unitsFromExecution`(:1211) → summary `resubmit_applied_unit_ids`(+`_count`)
→ 하니스 `BenchmarkRunLike`·`rowFromAttempt`. nested-workers flatten/preserve
경로(:2728, :3783)의 마커 보존 테스트 포함.

### 5.3 반증가능성 게이트 (lens1-F1 HIGH)

silent-zero(미배선인데 전부 0으로 일치·통과)를 막는 2단:
- 하니스 시작 positive 단언: `settingsForCase({retryResubmit:true})` 산출물이
  `retry.resubmit.enabled===true`임을 기계 검증(v1의 mechanical-OFF에 상응하는
  mechanical-ON; lens1-F3).
- 구현 검증에 **반려-강제 fixture 단위 테스트**: 알려진 unsupported-ref 반려를
  일으키는 유닛에서 count>0이 벤치 summary까지 관통함을 결정적으로 증명.
  mock 리허설은 0-관통만 증명함을 §3에 명기(lens3-F4). record 게이트로
  "count>0 요구"는 두지 않는다(완벽 모델의 정당한 0과 구별 불가).

### 5.4 H3 원안 기각 → resume 출처 스탬프로 대체 (lens2-MED, lens3-F2, lens4-F3)

H3 `contract_fingerprint`(record 저장) **기각**: resume는 record를 읽지 않아
inert(:713-728은 progress jsonl만 소비)이고, 커밋 sha는 dirty-tree 거짓 핀 +
무관 커밋에 정당 resume 거짓 거부. 대체(더 작음): **rows.progress.jsonl에
행별 `run_controls` 스탬프**({salvage_enabled, resubmit_enabled}) — resume
시드 시 현재 run과 불일치하면 fail-loud 거부. 스탬프는 resume가 실제 읽는
위치에 있고, v1 행(스탬프 부재)도 불일치로 거부되어 "계약 전환 후 이전 행
혼입"(lens2 시나리오: OFF-baseline + ON-candidate 혼합 record) 봉쇄.

### 5.5 잔여 정정

- 위반 코드명은 `rescue_channel_not_pinned`(:159)이며 메시지 극성 갱신 필요
  (lens1-F5). §2.1의 "run_controls 재사용" 표기는 필드명/코드명 혼동 — 정정.
- v2 승격은 "필요"가 아니라 의미변경 개명 위생: required 행 필드 신설만으로도
  v1 record는 parse 제외됨. stale "v1" 리터럴(check-supported-models.ts:222
  주석·:280 메시지, supported-models.ts:72·semantic-quality-gate.ts:7 주석)을
  grep 갱신 목록에 추가(lens4-F4·부수, lens2-LOW).
- "applied"의 정의: attempt-0 구조적 pre-injection(:4104, error:null·frozen
  근거)도 적용으로 계수한다 — 주입이 실제 일어난 모든 경우(lens2-LOW).
