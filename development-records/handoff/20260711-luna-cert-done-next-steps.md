# 2026-07-11 luna 인증 완료 — 다음 세션 시작점

## 재개 시 상태 검증 (먼저 실행)

```
pwd                     # /Users/kangmin/Documents/onto-mcp
git branch --show-current   # feat/luna-cert-arm-dispatch (푸시됨; main 복귀는 아래 주의 참조)
git log --oneline -3        # 5afae90 certify luna / 60d4fb5 witness harness / 799c662 ...
```

> **⚠ 공유 checkout 주의**: 이 checkout에서 Superset이 구동하는 codex 병행 에이전트가
> output-budget 기능을 작업 중이다(워킹트리 dirty ~66파일: INVARIANTS.md, reconstruct-api.ts,
> package.json, supported-models.yaml의 max_output_tokens 등 — **전부 그쪽 소유, 건드리지 말 것**).
> `git checkout main`은 우리 커밋 파일들을 워킹트리에서 되돌리므로 병행 작업 종료/merge 조율
> 전에는 브랜치에 머문다. origin/main은 로컬 main보다 6커밋 뒤(푸시된 브랜치가 조상 포함).

## 완료된 것 (이 브랜치 2커밋, 푸시됨)

- **gpt-5.6-luna 정식 등록**: `.onto/authority/supported-models.yaml`에 `semantic_map_synthesize`
  role, 증거 `development-records/benchmark/synthesize-cert/20260711-010535/` (record +
  rejudge-comparison). 양 judge(gpt-5.5·opus) 모두 candidate>=baseline 양 메트릭, no flip. G7 passed.
- **B4 하니스 3-fix** (각각 설계+교차검증 2종 후 구현):
  ① candidate identity를 declared brand로(codex alias false-fail 해소, l2 감사 identity 동일 수정) —
  `20260711-provider-brand-identity-class-design.md`
  ② candidate/negative arm effort 주입(codex TOML 상속 차단)
  ③ **arm_dispatch witness**: record가 capture에서 projection된 dispatch config를 나르고, 선언-대조
  guard가 fresh+rejudge 양쪽에서 fail-loud — `20260710-b4-cert-effort-witness-design.md`
- 검증 증거: `development-records/benchmark/{provider-brand-identity,effort-witness}-20260711/`

## 다음 작업 후보 (우선순위는 owner 결정)

1. **luna 실사용 배선**: 등록만 됐고 소비 배선은 안 됨 — reconstruct semantic_map synthesize seat
   (`RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH` 설정 경로)에 luna를 지정하는 settings 변경
   + 효과 확인이 별도 작업. sonnet-5도 같은 상태(등록만).
2. **review-side 등록 구조 해소** (sol high·fable5 medium은 완주 증거 있음, 등록은 구조적 보류):
   review seat은 fail-closed로 `author` role(=full-pipeline 완주 증거)을 요구하는데 미인증 모델을
   태울 경로가 없는 순환. `CONTRACTED_ROLES`에 review role 신설(INVARIANT-CHANGE: INV-MODEL-1 마커)
   또는 다른 설계 필요. 벤치 결과: sol 25/25(단 semantic_quality_gate 2/12 fail — 품질 별개 축),
   fable5 41/41(재실행; 1차는 한도+출력계약 혼합 중단).
3. **PR/merge 조율**: `github.com/kangminlee-maker/onto-mcp/pull/new/feat/luna-cert-arm-dispatch` —
   병행 output-budget 작업과 merge 순서 결정 필요(yaml은 양쪽 hunk가 독립이라 충돌 없이 합쳐질 것).
4. 소소한 잔여: capsule `obligation_incomplete`(production-contrast run — sonnet 선례처럼 등록은
   owner 결정으로 진행됨), `openaiProbe/anthropicProbe` 변수명 오칭(luna run에서 둘 다 codex),
   terra는 실재만 확인(워크로드 0회).

## 참조

- 세션 메모리: `onto-mcp-gpt56-fable5-model-verification-20260710.md` (상세 경위·정정 이력 포함)
- 중단 이력: run 2회 중단(외부 task kill 원인 미확증 / gpt-5.5 usage-limit stall 89분) — freeze
  checkpoint `--resume`이 두 번 다 재지출 없이 회복. 장기 run은 하니스 밖 nohup 분리 실행 권장.
