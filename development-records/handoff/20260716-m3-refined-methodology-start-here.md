# M3 정제 방법론 start-here (2026-07-16): 코드+canary+라이브 재실행 완료 → P1/P2만 잔존

정제 방법론(adequate-K + metric-distribution verdict + 위치 projection + engagement/canary gate)을
**구현·검증·라이브 재실행까지 완료**. authoritative baseline 확보(`20260716-refined-baseline/`).
남은 것은 P1(무비용 통합)·P2(owner-spend 모델비교)뿐이다. 이 문서는 `/clear` 후 재개용.

## 완료 요약 (라이브 재실행, 2026-07-16 owner 승인)

fixed instrument(위치 projection+K=8+분포 verdict+canary)로 첫 authoritative M3 측정 — 세 fixture 모두
**clean dominant·sd 0**: clinical **상회**(1.0/1.0) · credit **상회**(1.0/0.909) · manufacturing **도달**(1.0/0.808).
**fix 5 검증 성공(over-attribution 아님)**: clinical `issue-012→CLW-5`가 surface `finding-005`
target="Specimen lifecycle"과 축자 일치 = 진성 false-미달 교정. P0의 "clinical 미달"은 계기 버그 증상이었음.
상세: `development-records/benchmark/m3/20260716-refined-baseline/README.md` + 설계 §12.

## 재개 시 상태 검증 (먼저 실행)

```
pwd                              # /Users/kangmin/Documents/onto-mcp
git fetch origin && git status --short   # scripts/m3-*.ts 미커밋이면 이 세션 산출, 커밋됐으면 이력
npx vitest run scripts/m3-defect-spectrum.test.ts scripts/m3-attribution-judge.test.ts scripts/m3-run.test.ts
                                 # 66 passed
npm run check:ts-scripts         # EXIT 0 (M3 3개 스크립트 타입게이트)
npx tsx scripts/m3-run.ts --replay development-records/benchmark/m3/20260716-baseline-evidence
                                 # 3 fixture 모두 UNDERPOWERED (K=3 부족) — 무비용 실증
```
⚠ `--replay`는 replay-dir의 report.json을 재작성한다. **baseline dir에 직접 replay하면 커밋된
disclosure report.json(README Finding 3이 인용)이 오염**되니, 검증용 replay는 `--out <tmp>` 없이 절대
baseline dir에 직접 쓰지 말 것(또는 직후 `git checkout -- .../report.json`). 이번 세션도 그렇게 원복함.

## 이 세션에 착지한 것 (재도출 불필요, 설계 §12)

- **`m3-run.ts` 분포 verdict**: `aggregate`→metric 분포 1차(mean·range·**stdev**)+`classifyVerdict` 4종
  (`dominant`+noise_rate / `indeterminate` 진성 straddle / `underpowered` K<8 / `instrument_broken`
  전-run attributed=0). config `VERDICT_POLICY`(min_adequate_runs 8·dominant 0.85·significant 0.15),
  capture에 persist. `DEFAULT_JUDGE_RUNS` 3→8. 경계 대조군 테스트: K==8 adequacy(< vs <=), dominant_min
  0.85 inclusive(>= vs >), significant 0.15 inclusive — 모두 mutation-caught 확인.
- **위치 projection**(설계 §11 결정2): `SurfacedIssue.where`(finding.target)·`evidence_refs`,
  `buildAttributionUserPrompt`+시스템프롬프트 실어나름, `parseSurfacedIssues` target required.
- **engagement gate**(결정3 최소판): 전-run 무귀속 → instrument_broken(거짓 미달 차단).
- 스키마 `m3-capture/4`·`m3-report/4`. 73 테스트(+경계 대조군·canary·음성대조군). canary(`canary_defect_ids`,
  CLW-1/CRT-1/MBO-1) offline 검증 완료.

## 완료됨 (owner-spend 라이브 재실행, 2026-07-16) — 위 "완료 요약" 참조

라이브 재실행·authored-canary 모두 착지. authoritative baseline = `20260716-refined-baseline/`.
재실행 재현: `npx tsx scripts/m3-run.ts --judge-auth oauth --judge-runs 8` + 3× `--fixture …:… --session`
핀(clinical 20260611-f1a64fc4·credit 20260611-5161a370·manufacturing 20260611-ca3c674b). effort=low에서
judge 완전 결정론이라 K=8이 point mass(clean dominant) — 다른 모델(P2)은 SD 재측정 필요.

## 이후 (P1/P2, 무비용/별도)

- P1(무비용): `scripts/review-pipeline-benchmark.ts` 통합 + `--ontology-fixture` **분리** 경로(`--fixture`
  enum 게이트=구조적 경계 보존) + cert **3면 호환** 회귀(settingsForCase 필드계약·`as never` 프로브
  타입드화·양 플래그 alias, review-cert-run.mts:105/223/608). 설계 §5.
- P2(owner spend): 라이브 모델 비교(reps는 관측 SD 유도, CI 겹치면 무판정).

## 참조
- SSOT: `development-records/design/20260716-m3-model-characteristic-benchmark-design.md`
  (§3-3 정정·§10 실증·§11 owner결정·**§12 정제 구현 기록**)
- 머지: PR #211(main bc623d8). 이 세션 정제는 main follow-up.
- disclosure(replay 전용): `development-records/benchmark/m3/20260716-baseline-evidence/`
