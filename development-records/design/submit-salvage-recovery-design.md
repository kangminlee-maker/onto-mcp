# Submit Salvage Recovery — 설계 초안 (fail-loud but safe)

> 상태: **구현 완료 (P1~P4 + 계약)** — 미결정 3건 제안대로 확정(① settings `review.execution.retry.salvage`, 기본 opt-in=false ② 경로 B = 동일 등급 새 인스턴스 ③ attempt-level `salvaged_submit`). 구현: settings 스키마/해소(`settings-chain.ts`) + `recovery` 필드(`artifact-types.ts`) + 순수 로직(`cli/submit-salvage.ts`: 분류·병합·프롬프트·sentinel) + executor 동결/stale-제거/`--salvage-from` 모드(**claude·codex 양 adapter**) + 러너 소진-후 트리거(발동 신호 = 동결 파일 존재 — failure_kind 메시지 휴리스틱의 분류 갭(S1 "no structured payload"가 executor_exit로 분류되던 문제)을 구조적으로 우회; child_results 감사 보존) + 계약 §3.3(`external-oauth-worker-contract.md`). 검증: salvage 단위 10케이스(실측 S2를 실제 validator로 재현 — 부분 거부→병합 수락), settings 23, stamp/golden 갱신, 전체 940 passed. P5 잔여: 벤치 표면의 자력/회수 분리 *보고*(데이터 필드는 존재 — 소비자 추가는 후속), live S2 재현 검증(다음 fable 벤치에서 salvage enabled로). lexicon: 신규 top 개념 없음(필드 enum — 계약 문서가 소유)으로 bump 불요 판단. 기준 코드: `feat/phase2-followups`.
> 동기 실측: fable 벤치마크 bom run `20260611-ca3c674b` — `issue-stance:logic`이 `output_contract`로 재시도 소진(`submit_issue_stance_response is missing issue_id(s): issue-021`), 상류 2시간 의미 작업(lens 6 + ledger 3 유닛 완주)이 폐기됨.
> 적용 시점 제약 해소 근거: salvage는 opt-in(`enabled: false` 기본)이라 settings로 활성화하지 않는 한 실행 행동이 불변 — 진행 중인 fable 벤치마크(이미 로드된 장수 프로세스이기도 함)와 변수 비충돌(INV-EXP-1 유지).

## 1. 목표

구조화 제출 계약 위반을 **fail-loud 그대로 기록**하되, 이미 생산된 의미 내용을 **계약 위반 모델 모르게** 최소 비용으로 회수해 유닛을 완료시키는 복구 경로를 추가한다. "safe"의 의미: 회수물도 동일 validator를 통과해야만 seat가 되고, 회수 사실이 감사 가능하게 남는다.

비목표: 제출 계약 완화(검증 기준 하향), 회수물의 무표시 편입, 원 모델 재설득(전체 유닛 재실행은 기존 retry가 이미 담당).

## 2. 실패 모드 분류 (실측 기반)

| 모드 | 정의 | 현 경로 실측 | 회수 가능성 |
|---|---|---|---|
| **S1. 무호출-내용존재** | 제출 도구 미호출, 최종 텍스트에 내용 존재 | 텍스트가 JSON이면 이미 흡수됨(`extractClaudeStructuredPayload`가 `structured_output` 부재 시 result 텍스트에서 JSON 추출·coerce — claude executor 기실장). **prose-only**(비JSON 산문)만 실패로 남음 | 전사로 회수 가능 |
| **S2. 부분 제출** | 도구 호출됨, payload가 필수 행 일부 누락 (bom 실측: stances 21행 중 issue-021 누락) | validator가 fail-close → retry 2회 → 유닛 실패 → run halt | 누락분에 한정한 **경계-한정 보완**으로 회수 가능 — 단, 누락분의 의미는 원 텍스트에 없을 수 있어 전사로는 불가 |
| **S3. 형식 위반** | 호출됨, 필드 누락/오타/enum 위반 | 동일 fail-close | 전사(필드 정규화)로 회수 가능한 경우 多 |
| (비대상) transient | 네트워크/한도 (`executor_exit`+ConnectionRefused 등) | 기존 retry가 적임 | 회수 경로 비적용 |

핵심 함의: 사용자 안(저모델 재작성)은 S1-prose·S3에 정확히 들어맞고, **실측으로 가장 빈번할 S2는 "전사"가 아니라 "누락 행만의 의미 생성"이라 별도 취급**이 필요하다.

## 3. 설계

### 3.1 개념 배치 (concept economy)

신규 개념 1개만 도입: **salvage attempt** — 기존 attempt/child_results 어휘의 한 종류. 선례: nested 배치의 "batch=attempt#1 → flat retry fallback"(실패 attempt가 child_results로 감사 보존, 첫 신뢰 결과가 parent). salvage는 "본 실행 attempt들이 `output_contract`로 소진된 뒤에만 열리는 마지막 attempt"다.

- `ReviewUnitFailureKind` 무변경 (output_contract 재사용).
- attempt 기록에 회수 표시: `recovery: "salvaged_submit"` (신규 토큰 1개, attempt-level. 기존 토큰 조사 후 재사용 가능하면 대체).
- ledger 투영: parent = salvage 완료 결과(완료 상태 권위), child_results = 소진된 본 실행 attempt들(감사 추적) — **first-wins dedupe 기존 규칙 그대로**.

### 3.2 회수 경로 2종

공통 불변식: ① 회수자는 **계약 위반 모델이 아니다**(원 턴은 동결된 증거 — "모르게"). ② 회수물은 **동일 validator**(`structured-output-tools.ts`의 해당 submit 검증)를 통과해야만 seat가 된다. ③ seat 직렬화·기록은 코드(executor)가 소유 — 회수 LLM은 bounded payload만 낸다(capability-boundary: "Text output … does not become artifact truth" 준수 — 동결 텍스트는 진실이 아니라 회수의 *입력*). ④ 회수 실패 시 유닛은 기존대로 실패 확정(fail-loud 종단 불변).

**경로 A — 전사 회수 (S1-prose, S3)**
- 입력: 동결된 최종 텍스트 + 대상 submit 스키마 + (S3는) validator 오류 메시지.
- 회수자: **저비용 모델**(transcription은 의미 작업이 아님 — 사용자 제안 그대로).
- 계약: "텍스트에 있는 내용을 스키마로 옮겨 적기만. 텍스트에 없는 필수 내용 발견 시 `SALVAGE_INCOMPLETE` 선언 후 중단" — **발명 금지 가드**. 가드 검증: 회수 payload의 모든 의미 필드 값이 원 텍스트에서 근거 가능해야 한다(스팟체크는 validator + 전사 모델의 자기 선언; 의미 동등성 정밀 검증은 비범위로 명시).
- 비용: 유닛 재실행 대비 ~1/10 이하.

**경로 B — 경계-한정 보완 (S2)**
- 입력: 검증 통과한 부분 payload(예: 20/21 stance 행) + validator가 특정한 누락 집합(`missing issue_id(s): issue-021`) + 원 unit packet의 해당 경계 부분.
- 회수자: **유닛과 동일 등급 모델의 새 인스턴스**(누락 행은 새 의미 판단이므로 저모델 부적합) — 단, 프롬프트는 "누락된 issue-021의 stance 1행만" 산출하는 미시 턴으로 경계를 좁힌다. 비용: 전체 유닛의 1/N.
- 병합은 코드 소유: 검증된 부분 payload + 보완 행 → 재검증 → seat. LLM은 병합하지 않는다.
- 주의: 부분 payload가 보존되려면 executor가 validator 실패 시 **payload를 폐기하지 않고 실패 기록에 동결**해야 한다(현재는 메시지만 남음 — P1의 핵심 변경점).

### 3.3 fail-loud 유지 장치

1. 본 실행 attempt 실패는 지금과 동일하게 `output_contract`로 기록(소거·격하 없음).
2. salvage attempt는 별도 attempt로 기록되며 `recovery: salvaged_submit` 표시 — record/ledger 투영에서 자력 제출과 구분 가능.
3. 벤치마크 표면: 모델 비교 지표에 **자력 제출률 vs 회수 완료율**을 분리 보고(게이트/채점 하니스가 recovery 토큰으로 분류). fable처럼 도구-계약 준수가 흔들리는 모델의 신호가 오염되지 않는다.
4. 회수 자체가 실패하면 유닛은 기존 실패 종단 그대로 — 회수는 추가 기회일 뿐 안전망 위장이 아니다.

### 3.4 capability surface 배치

| 권위 | 소유 |
|---|---|
| 동결 텍스트/부분 payload 캡처 | executor(코드) — 실패 기록에 동봉 |
| 회수 트리거 판정 (failure_kind=output_contract && 본 retry 소진) | runtime retry 정책(코드) |
| 회수 payload 의미 | 회수 LLM (bounded) |
| 병합·직렬화·seat 기록·재검증 | executor/runtime(코드) |
| 회수 모델·활성화 설정 | settings chain (**보호 항목** — §5) |

### 3.5 settings (보호 항목 — 사용자 확인 게이트)

`review.execution.retry`에 salvage 정책 추가(예: `salvage: { enabled, transcription_llm: {provider, model}, delta_completion: "unit_llm" }`). **settings 스키마 변경은 INV-CFG-1 인접 보호 영역**이므로 구현 전 키 형태를 사용자와 확정한다. 기본값 제안: `enabled: false`(opt-in — 벤치마크 재현성 보호).

## 4. 구현 단계 (승인 후)

| 단계 | 내용 | 게이트 |
|---|---|---|
| P1 | executor 실패 기록에 동결 텍스트/부분 payload 동봉 (회수 입력 확보; 행동 무변경) | 단위 테스트 + 기존 suite 무회귀 |
| P2 | salvage attempt 어휘: ledger/record에 recovery 토큰 + first-wins 투영 검증 | ledger 단위 테스트 |
| P3 | 경로 A(전사) — mock realization으로 결정론 테스트 + 실패 케이스(발명 가드 발동) | validator 통과·가드 테스트 |
| P4 | 경로 B(경계-한정 보완) — S2 재현 fixture(부분 payload)로 검증 | bom 실측 케이스 재현 테스트 |
| P5 | 벤치마크 표면 분리 보고(자력/회수) + rank-5 계약 문서(`prompt-execution-runner-contract.md` 보강 또는 신규) + lexicon note | 정적 체크 + 문서 정합 |

redesign 트리거: P1에서 부분 payload 동결이 기존 실패 경로 계약과 충돌하면(예: 실패 시 산출물 부재를 가정하는 소비자 발견) 중단 후 재설계. 검증 완료 기준: S1-prose/S2/S3 각 1 케이스가 mock으로 결정론 재현되고, salvage 표시가 record까지 투영되며, 회수 실패 시 기존 실패 종단과 byte-동일.

## 5. 확정 (사용자 결정, 2026-06-11)

1. settings: `review.execution.retry.salvage { enabled: false 기본(opt-in), transcription_llm, delta_completion: "unit_llm" }` — 스키마 추가 사용자 승인됨.
2. 경로 B 회수자: **동일 등급 새 인스턴스** 확정.
3. recovery 토큰: **attempt-level `salvaged_submit`** 확정.

## 6. Live 검증 (2026-06-11 — 실 LLM·실 packet·실 validator)

vehicle: 실측 실패 세션(bom `ca3c674b`)의 **원본 issue-stance:logic packet**(36-이슈 projection, tmp 생존)에 executor를 직접 호출. 동결 입력은 live attempt #1(실 fable 36/36 제출 성공)의 실제 payload를 외과 변형 + **실제 validator의 거부 텍스트**로 구성(합성 요소는 변형 1곳뿐 — 라벨 명시). evidence: `fixtures/salvage-live-verification/`(스크립트·동결 입력·산출 seat).

| 케이스 | live 결과 |
|---|---|
| 경로 B — delta (S2, 실측 케이스형: `missing issue_id(s): issue-021`) | **성공** — 분류 `delta_rows` → 실 fable micro-call이 누락 1행만 산출(packet evidence allowlist 내 refs) → 코드 병합 35+1 → 실 validator 통과·seat 기록 |
| 경로 A — 전사 (S3 unknown-field: `unsupported field confidence_note`) | **성공** — haiku 전사가 36/36 행 의미 보존(rationale·stance 동일) + 미지 필드 드랍 → validator 통과 |
| 경로 A — 전사 (S3 enum near-miss: `strongly_support`) | **보수적 포기** — haiku가 enum 정정을 해석으로 판단, `SALVAGE_INCOMPLETE` 선언 → 회수 실패 → 기존 실패 종단. 가드 우선·fail-loud 유지(의도된 안전 동작); enum near-miss류는 회수율이 낮을 수 있음(한계 데이터) |
| 발명 가드 (36행 중 3행만 있는 prose) | **발동** — `SALVAGE_INCOMPLETE` abort, seat 미기록 |

미경유(명시 한계): parent의 소진-후 트리거는 본 검증에서 executor 직접 호출로 우회 — 그 로직은 결정론 suite가 커버하며, 완전 유기적 발동은 salvage enabled 벤치마크에서 관찰 예정.
