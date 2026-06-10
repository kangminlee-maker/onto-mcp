# 비코드 온톨로지 문제 평가 기록 (2026-06-10, PRELIMINARY)

> 목적: 리뷰 파이프라인이 코드 밖의 복잡한 개념 문제에서도 의미 있는 발견을 하는지 검증(사용자 지시). 도메인 3종 × seeded 개념 결함 10개씩, live core-axis 리뷰(현 mixed effort 프로파일, codex OAuth) 각 1 run.
> **PRELIMINARY** — INV-BENCH-1(runs≥3×fixtures≥2) 미충족. 결론은 방향 신호로만 사용.
> fixture/ground truth: `development-records/benchmark/fixtures/ontology/` (ground truth는 리뷰 타깃 비포함 — 리뷰어 비노출 유지).

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

## 후속 (사용자 확정 순서)

1. semantic gate의 비코드 일반화 (최우선)
2. 부재형 결함 감지 보강 → 3. 파생 추론/도메인 신호 보강 → 4. CRT-5 재실행 검증
