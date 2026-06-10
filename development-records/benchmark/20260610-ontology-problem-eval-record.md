# 비코드 온톨로지 문제 평가 기록 (2026-06-10, PRELIMINARY)

> 목적: 리뷰 파이프라인이 코드 밖의 복잡한 개념 문제에서도 의미 있는 발견을 하는지 검증(사용자 지시). 도메인 3종 × seeded 개념 결함 10개씩, live core-axis 리뷰(현 mixed effort 프로파일, codex OAuth) 각 1 run.
> **PRELIMINARY** — INV-BENCH-1(runs≥3×fixtures≥2) 미충족. 결론은 방향 신호로만 사용.
> fixture/ground truth: `development-records/benchmark/fixtures/ontology/` (ground truth는 리뷰 타깃 비포함 — 리뷰어 비노출 유지).
> 채점 근거 아티팩트(영속화): 각 fixture의 `evidence/<session-id>/` (finding/issue ledger·problem-framing·record·final-output 등 — PR #28 P2 반영, 세션 tmp 의존 제거). 러너는 HOME 격리로 사용자 settings 혼입을 차단한다.

## 실행

| fixture | 세션 | 시간 | 상태 | findings/issues |
|---|---|---|---|---|
| clinical-lab-workflow | 20260610-5fbe917f | 882s | completed | 19 / 13 |
| credit-risk-taxonomy | 20260610-b4c2568c | 737s | completed | 17 / 10 |
| manufacturing-bom | 20260610-9ced06aa | 1252s | completed | 16 / 14 |

## 채점 (ground truth 의미 대조)

| 도메인 | 강검출 | 부분 | 미검출 | 회수율(부분=0.5) |
|---|---|---|---|---|
| 임상검사 | 8 | 2 (CLW-6 관계중복 미명명, CLW-10 Order측 미명시) | 0 | 9.0/10 |
| 여신리스크 | 7 | 1 (CRT-6 순환정의→개념혼합으로 우회 포착) | 3 (CRT-3·4·5) | 7.5/10 |
| 제조 BOM | 8 | 1 (MBO-4 이중경로 미명명) | 1 (MBO-8) | 8.5/10 |
| **계** | **23** | **3** | **4** | **~82%** |

- **환각 0/52 findings** — 전 finding이 문서 근거 보유.
- **미주입 실결함 ~9건 추가 발견**(전부 타당): 검체 거절/재채취 상태, 정정 감사·버전, 폐쇄 enum 확장성, RiskRating→Exposure 구조 경로, lot/serial 추적, 작업지시 개념 등.
- lens 기여 관찰: axiology가 권위/목적 부합성(高 severity 정확), logic이 형식 모순("동일 claim 내 양립 불가"), semantics가 is-a 오용/의미 혼동, coverage가 부재 영역 일부.

## 미검출 4건의 패턴 (보강 후보)

1. **부재형 결함에 약함**(3건): 등급 시간성 부재(CRT-4)·Part lifecycle 부재(MBO-8)·시간 모순의 Order 측(CLW-10 부분). "있는 것의 모순"은 강하나 "없어야 보이는 것"이 약함 → coverage/lens 프롬프트의 결손-점검(시간성·lifecycle·감사 체크리스트) 강화 후보.
2. **도메인 산식 파생 추론 필요**(1건): LTV=금액/평가액 관계 인지가 전제인 CRT-3 — 도메인 바인딩 없이는 구조 신호만으로 한계.
3. **분산 의심**(1건): CRT-5(한도 이원화)는 표면 신호("합산 관리")가 있었는데 miss — 재실행 검증 대상.

note-한-줄 결함 자체는 약점이 아님(MBO-5·9 검출이 반례) — 1차 가설 기각.

## 함께 확인된 인프라 한계

- **semantic quality gate가 코드 fixture에 결합**: `SemanticQualityGateFixtureId`가 닫힌 union(코드 fixture 2종)이고 기대 어휘가 fixture-앵커라 비코드 타깃에 게이트를 적용할 수 없음 → 이번 평가는 ground-truth 수동 대조로 채점. **비코드 일반화가 후속 최우선**(사용자 확정).

## 후속 1 완료 — semantic gate 비코드 일반화

게이트 체크는 target-agnostic으로 유지하고, target-특정 데이터(필수 material 어휘·boundary decoy·anchor)를 주입형 `SemanticQualityExpectations`로 분리했다(코드 fixture 2종은 동일 형태의 내장 preset으로 잔존). 각 온톨로지 fixture는 ground truth에서 도출한 `semantic-expectations.yaml`을 보유하며, `evaluate-semantic-gate.mts`가 영속화된 evidence에 게이트를 적용한다.

| fixture | gate | 비고 |
|---|---|---|
| clinical-lab-workflow | **passed** (12/12) | 구조 체크 포함 전부 통과 |
| credit-risk-taxonomy | **failed** (recall 3종만) | `ltv`(CRT-3)·`available_limit`(CRT-5) 부재 — 수동 채점 미검출과 정확히 일치 (true negative) |
| manufacturing-bom | **passed** (12/12) | |

- 게이트가 수동 채점과 동일한 판정을 자동 재현 → 비코드 타깃에서도 판별력 확인. 결과 JSON: `fixtures/ontology/semantic-gate-results-*.json`.
- **일반화로 드러난 게이트 결함 1건 수정**: `issue_dependency_preservation`이 same_root 병합으로 동일 issue에 합류한 finding 쌍의 shared_cause 관계(교차-issue 의존이 구성상 불가능)를 실패 처리 — 코드 fixture의 2~3 finding 위상에서는 노출 불가. co-location을 보존으로 인정하도록 수정(shared_cause를 병합 증거로 쓰는 위반은 기존대로 실패).
- 한계: 온톨로지 expectations에는 seeded non-material decoy가 없어 boundary 계열 체크는 공허 통과 — decoy 주입은 부재형 보강(후속 2)과 함께 설계 후보.

## 후속 2·3·4 완료 — lens 보강과 검증 (PRELIMINARY)

**③ baseline 재실행** (무변경, credit-risk 세션 `20260610-4bfe81da`): CRT-5 **2/2 miss → 구조적 맹점 확정**, CRT-3 재실행에서 검출(분산이었음 — ② 목표를 "불가능"이 아닌 "불안정→안정화"로 수정), CRT-8 신규 miss(분산). *어떤* 결함이 잡히는지의 run간 분산이 실재함.

**① coverage 차원-결손 probe** (`.onto/roles/coverage.md`): 시점 의존 값의 유효기간·이력, lifecycle 전 구간(종결 후 정정·재발행 포함), 통제 행위의 감사 증거, **병행 관리 값의 단일 권위 지정 부재**(CRT-5류를 부재형으로 귀속). **② semantics 파생값-입력 probe** (`.onto/roles/semantics.md`): 이름이 도메인 산식을 내포한 속성의 독립 입력 모델링 + 원천 공존 점검. fixture 어휘는 role 문서에 미포함(오염 방지). 귀속 분리의 정확한 범위: ①②를 한 배치로 적용했으므로 **round1 finding 수준만 분리 가능**하다 — 각 lens 프롬프트는 자기 role 문서만 임베드하므로 coverage finding은 semantics.md 변경의 영향을 받을 수 없다(역도 동일). 반면 **다운스트림 결과(이슈 병합·심의·게이트 통과)는 ①+② 결합 효과**이며 단일 변수 run 없이는 분리되지 않는다(아래 표의 귀속은 round1 finding-ledger 수준).

**보강 후 3-fixture 재실행** (세션: clinical `20260610-e661bc6c`, credit `20260610-1ac96d31`, bom `20260610-36ef1faa`) — **게이트 3/3 통과**. 재현(세션 고정, mtime 비의존):

```
npx tsx development-records/benchmark/fixtures/ontology/evaluate-semantic-gate.mts \
  clinical-lab-workflow:20260610-e661bc6c credit-risk-taxonomy:20260610-1ac96d31 manufacturing-bom:20260610-36ef1faa
```

| 표적 | 이전 | 보강 후 | 귀속 |
|---|---|---|---|
| CRT-5 한도 이원화 (구조적) | 0/2 | **CAUGHT** | axiology + **coverage(① 권위 probe)** 독립 검출 |
| CRT-3 LTV | 1/2 (분산) | **CAUGHT** | coverage + **semantics(② probe)** |
| MBO-8 Part lifecycle | 0/1 | **CAUGHT** | **coverage(① lifecycle probe)** |
| CRT-8 환율 (분산) | 1/2 | CAUGHT | axiology+coverage |
| CRT-6 순환 정의 | partial | partial+ — semantics가 "파생되는 준수 판정"으로 포착(② 일반화) | semantics |
| CLW-10 completed↔corrected | partial | **여전히 miss** — probe에 명시했음에도 Order.completed와 연결 실패 | 잔여 약점 |
| 기존 검출 회귀 (3 fixture 19종 어휘) | — | **전부 유지** + MBO-4 이중경로 신규 검출(structure) | |

- 한계: 보강 후 각 fixture 1 run — INV-BENCH-1 기준 PRELIMINARY. 게이트 통과·이슈 구성 변화는 ①+② 결합 효과로만 기록(단일 변수 run 미수행). CLW-10(종결 상태 의미의 시간 모순)은 부재형이 아니라 모순형이라 coverage probe로 안 잡히는 것일 수 있음 — logic lens 관점 보강이 후속 후보.

## 후속 5 완료 — CLW-10 logic 시간 전개 probe (PRELIMINARY)

`.onto/roles/logic.md`에 **시간 전개 만족 가능성 probe** 추가(단일 변수 — INV-EXP-1 충족): 종결·완료 판정 규칙이 가역 상태에 의존하는지, 허용된 후속 사건(정정·재발행·취소·소급 변경)이 판정된 종결 상태와 모순을 만드는지 — 스냅숏 만족 가능성을 넘어 상태 전개 경로 위 만족 가능성 점검.

검증 재실행(clinical 세션 `20260611-f1a64fc4`): logic finding-011이 시간 전개 모순을 발화 — 단, **conflict_pair 앵커는 `state_rules[2]`(Report finalized↔amended)**이고 CLW-10의 정의 앵커는 `state_rules[1]`(Order completed 조건)이다. 즉 **probe의 클래스 효력은 실증**(스냅숏이 아닌 상태 전개 경로 모순을 fail verdict로 정확히 형식화 — "finalized가 허용된 경로 위에서 종결 해석 불안정")됐으나, **CLW-10 자체는 표적 앵커 기준 여전히 miss**(0/3). 회귀 0(기존 7종 어휘 전부 유지, material 12), pinned gate 12/12 통과 — 단 gate expectations는 material 결함 어휘만 검증하므로 **gate 통과는 CLW-10(medium_or_above) 회수를 검증하지 않는다**. 재현: `evaluate-semantic-gate.mts clinical-lab-workflow:20260611-f1a64fc4`.

잔여 현황: seeded 30결함 중 표적 앵커 기준 잔여 miss = **CLW-10 1건**(동일 클래스 모순을 한 줄 옆 규칙에서 발화한 만큼, 다음 후보는 probe 강화가 아니라 분산 확인 재실행). 보강 후 run은 fixture당 1회로 PRELIMINARY. 분산 안정화 평가(runs≥3)는 decision-grade 필요 시.
