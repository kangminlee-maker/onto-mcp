# 형식-한정 반려 대응 (2026-07-12, v3 — 다관점 검증 반영)

상태: v3 확정안. v2의 두 기둥(per-issue enum 봉인, salvage-first)은 4-렌즈
독립 검증(codex gpt-5.6-sol@ultra ×4: 정합성/경계·권위/실패모드/개념경제)과
코드 재검증으로 **기각**됐다(§5 기각 기록). 확정안은 기존 기계의 활성화 +
실측이며, 신규 개념 0개다.
증거: `development-records/benchmark/review-cert/20260712-101717/stance-rejection-diagnosis.md`
리뷰 원문: 세션 스크래치 `design-review/out1..4.md` (요지는 §5에 보존)

## 1. 문제 (불변)

형식-한정 실패(내용 완성·직렬화만 계약 밖)가 최대-비용 경로로 흐른다:
무피드백 재시도 ×3(같은 티어, 같은 실수 반복 실증) → 유닛 halt → 리뷰
halt → (cert에선) attempt 전체 재실행.

## 2. 확정안 — 기존 resubmit 기계 활성화 + 실측 (신규 코드 최소)

진단이 이미 결론냈고 검증이 재확인한 사실: **설계 A resubmit(§4-6a)이
관찰된 실패 클래스를 정확히 겨냥한 기설계·기구현 채널**이다.

- 동작(기구현): 반려 분류(`RESUBMIT_UNIT_ROUTING` — stance/deliberation/
  synthesis) → 다음 재시도 패킷에 반려 원문+해당 이슈의 허용 ref 전체 목록
  주입(기존 예산 재사용, 추가 attempt 없음) → 소진 시 유닛 강등
  (complete-with-failure, 리뷰 완주) → 동일 클래스 과반 실패 시
  `correlated_validation` 전체 halt(부채 가시화 내장).
- 사용자 목표와의 정합: "형식 실패 때문에 리뷰 전체 재실행" 낭비가 강등
  경로로 구조 제거되고, 재시도는 정답 목록을 든 1~2회의 정보형 시도가 된다.
  "재실행 0회"(전사) 이상은 §5-C 사유로 이 클래스에 불건전.

### 2.1 구현 항목 (전부 소규모)

a) **벤치마크 노브**: `scripts/review-pipeline-benchmark.ts` settingsForCase에
   opt-in 플래그 `--retry-resubmit`(기본 off; on이면 temp project settings에
   `retry.resubmit.enabled=true` 기록). 기본 off 시 바이트-동일(디프 증명).
b) **실측(N=1→확대)**: fable5 stance-heavy fixture 1 attempt를
   `--retry-resubmit`로 실행 — error-spec 재시도가 실제로 반려를 푸는지,
   유닛 강등/상관-halt가 관측되는지. (이것이 v2가 건너뛴 counterfactual.)
c) **운영 문서**: production은 `.onto/settings.json`
   `review.execution.retry.resubmit.enabled=true`로 즉시 사용 가능(코드 0).
d) cert 관계: M-1 핀(원측정)은 현행 유지. rescue-enabled 측정 + rescue_rate
   공개 지표의 cert v2는 owner 결정(§4) — b)의 실측이 그 결정의 입력.

### 2.2 검증

- a) 노브 off 디프-불변 + on일 때 temp settings에 resubmit true 확인(단위).
- b) 실행 로그에서 `runner stance resubmit:` 라인과 결과(성공/강등) 채집.
- 기존 resubmit/demotion 테스트 스위트 green 유지.

## 3. 후속 후보 (본 cut 제외 — 각각 독립 결정·독립 diff)

- H1 빈 issue-context 봉인: 권위 있는 `issue_evidence_refs={}`가 no-context
  fallback으로 흘러 임의 stance 행을 허용(제출 통과 후 후단 거부). context
  부재와 분리해 `stances.maxItems=0` 봉인. (렌즈1 #4)
- H2 submit-vs-on-disk 화이트리스트 단일화: submit은 lens finding ref를 전
  이슈에 합집합, on-disk는 이슈-엄격 — submit 통과 후 on-disk 거부 가능한
  잠복 이원화. 단일 builder + parity 테스트. (렌즈2 #1)
- H3 cert resume 개정 지문: record에 스키마/코드 revision 지문이 없어 계약
  변경 전후 row 혼합이 구조적으로 가능. resume 시 지문 불일치 거부. (렌즈3 #5)
- H4 transcription_llm provider 불일치의 조용한 fallback을 감사 가능하게.
  (렌즈2 #6)

## 4. owner 결정 잔여

- [ ] cert 계약 v2: resubmit-enabled 측정 + rescue/resubmit rate 공개 지표.
- [ ] 준 사용승인 tier(품질 통과+구제 의존) registry 표기와 G7 binding.
- [ ] production 기본값 전환(현재는 opt-in 문서화까지).

## 5. 기각 기록 (v2 → v3, 재발 방지용 근거 보존)

- **A. per-issue enum 봉인 기각**: (i) worker 스키마 병합기
  (`worker-structured-output.ts` collapseHomogeneousAnyOf/mergeHomogeneousProperty)
  는 property 최상위 enum만 병합하고 중첩 `items.enum` 차이는 병합 포기 →
  anyOf 잔존 → 고정 테스트(`items.anyOf` 부재) 파괴; (ii) rank-2 원칙
  (`llm-native-development-guideline.md` §3)이 긴/source-derived ref를
  "provider schema string + runtime allowed-set"으로 규정, anti-pattern #5가
  quote-heavy enum 금지; (iii) 과거 live에서 긴 quoted ref로 provider 스키마
  거부 기록(20260607 plan). 스키마-레벨 봉인을 재론하려면 H2 단일화 +
  병합기 재설계 + provider live 검증이 전제(별도 설계).
- **B. salvage.mode="first" 기각**: settings 체인 수동 복사·continuation
  복원·manifest 영속·기본값 satisfies 등 6+ 좌석에 배선 필요(누락 시 조용한
  소실 또는 typecheck 파괴), `.onto/settings.json`·artifact 계약 변경으로
  owner 확인 대상, `salvaged_submit`의 계약 의미("정규 예산 소진 후")와 충돌,
  기존 `delta_rows` 회수를 차단하는 회귀, correlated-halt 신호 기아,
  `correctiveRetriesLeft` 상태기계의 재진입/0-예산/미발동 합류 미봉합.
- **C. unsupported-ref 클래스의 전사(salvage) 부적합**: 전사기는 허용 목록
  없이 "EXACTLY as written" 전사만 지시받음 → 같은 ref를 그대로 옮겨 재반려
  (무가치 지출). 목록을 주거나 스키마로 강제하면 ref 재선택 = 근거-주장
  연결의 비저자 변경(세탁; 빈 배열도 membership 통과). 근거 선택은 저자
  판단 → 정보형 재시도(resubmit)가 이 클래스의 최저비용 건전 구제.
- (참고) v2가 신설하려던 `enumArrayField`/`maxItems`/`salvage_stage`는 전부
  불필요해짐 — stance/deliberation의 허용 집합은 라이브에서 공집합이 되지
  않고(issue-ledger ref 필수 추가), synthesis는 공집합 fail-loud가 기존재.
