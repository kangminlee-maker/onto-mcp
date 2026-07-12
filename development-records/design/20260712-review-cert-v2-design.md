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
