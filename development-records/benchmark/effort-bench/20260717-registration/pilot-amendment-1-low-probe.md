# Pilot amendment 1 — low(40) 프로브 (2026-07-18, owner 승인)

등록(preregistration.yaml, freeze f9e2038)의 파일럿 기술은
`clinical-lab·manufacturing × {full, partial} × medium × R=3`이었다. 이 amendment는
파일럿 결과(partial(60)에서 ITT≈0 — pilot-variance-report.json) 이후, owner가
확증 매트릭스 대신 **low(40) 소규모 프로브**를 선택(옵션 2)한 데 따른 범위 확장 기록이다.

## 확장 내용

- **셀**: low(40) × medium × {clinical-lab-workflow, manufacturing-bom} × clean R=3
  (기존 파일럿과 동일한 두 fixture — full 기준선 재사용, 신규 spend는 low arm 6 리뷰 + 채점만)
- **실현**: 커밋된 `arm-settings/settings-low-medium.json` (knob=40, confound 증명 통과분)
- **채점**: 동일 프로토콜 (judge K=8, effort=low 핀, capture 영속·replay 재채점)
- **admission**: 동일 (witness effective==40 정확 일치, session 결합, strict completed만 산입)

## 목적과 한계 (등록 규율 유지)

- **목적**: 등록 사다리의 남은 zone(C2의 treatment)에서도 ITT≈0인지 신호를 확보해
  확증 매트릭스 spend 결정을 정보에 기반해 내리기 위함. 결정론 ceiling: 컷 밖
  material 비율 clinical 6/7 ≈ 0.86, manufacturing 4/8 = 0.5 (coverage-map-report).
- **비확증**: 이 프로브의 데이터는 파일럿과 동일하게 **확증 셀에 산입하지 않는다**.
  등록 대비(C1·C2)의 공식 판정은 여전히 4-fixture cohort 전체의 확증 라운드에서만
  발화 가능하다(attrition 규칙 불변). 이 프로브가 산출하는 것은 분산·점추정 신호뿐이다.
- **동결 불변**: preregistration.yaml의 어떤 값도 변경하지 않는다. 이 문서는 범위
  확장의 기록이며, dispatch는 이 문서의 커밋 이후에만 발생한다.
