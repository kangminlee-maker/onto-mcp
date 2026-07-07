# RESUME: INV-MODEL-1 B4 — 하니스 빌드 완료 → 라이브 캡처 (예산 승인 후)

> 앞 세션(2026-07-07 · Fable 5)이 design v3 §15 S1~S8 하니스를 **빌드 완료 + mock E2E 무지출 실증**.
> 이 문서 = clear 후 라이브 캡처 세션의 START-HERE. SSOT =
> `development-records/design/20260706-b4-r8-harness-design.md`(v3·헤더에 빌드 상태).

## 0. 지금 어디인가 (CONFIRMED @ 2026-07-07)

- branch `feat/inv-model-1-b4` · 빌드 커밋 9개 `ada79d2`(S1)→`58fa1f6`(S8) · 미푸시.
- **full vitest = 2559 passed + 1 todo (158 파일·회귀0·baseline 2495+신규 64)** — 이 세션 실측.
- 정적 게이트 전부 통과: ts-core · import-boundary · invariant-drift · spec-defaults ·
  invariant-change(protected_changes 0 — **shipped `synthesize-cert-record.ts` 이번 빌드에서 불변**).
- 라이브 배선 완료(2026-07-07): --go = 실좌석 배선·quota probe·cap 게이트. 남은 순서 = §3 2~6.

## 1. 빌드 산출물 (src/core-runtime/discovery/)

| 슬라이스 | 파일 | 핵심 |
|---|---|---|
| S1 | `synthesize-cert-sampler.ts` | 층화 샘플러(merge=작은-서브트리 K·leaf=seeded stride)·2-단 identity(`deterministic_facts_sha256`/`input_sha256`)·pre-spend floor 게이트(+`stratum_global_floor` 예측) |
| S2 | `synthesize-cert-packet.ts` | `freezeSynthesizeCertPackets` — reference child 저작(production bridge walk 미러·memoize)→frozen packet·manifest↔pipeline facts-sha binding |
| S3 | `synthesize-cert-mutation.ts` | `input_corruption/v1`(relabel + seam offset ≥2)·무레버 거부·per-metric provenance |
| S4 | `synthesize-cert-judge.ts` | judge seat 타입 + total-enum verdict 가드(원본 packet 기준·전 arm 동일) |
| S5 | `synthesize-cert-loop.ts` | 실패-보존 좌표 루프(전 좌표 1 row·양 평면 분리·resume attempts·soft-abort·`synthesizeCertOutputSha256`) |
| S6 | `synthesize-cert-capsule.ts` | `synthesize-cert-capsule/v1` zod + `assembleSynthesizeCertCapsule` + source-safe deep-scan 가드 |
| S7 | 〃 + `synthesize-cert-assemble.ts` | record 조립기(공유 aggregates·mutation 단일출처) + **`validateSynthesizeCertCapsuleBinding`(신규 sibling gate)** |
| S8 | `synthesize-cert-e2e.test.ts` + `scripts/b4-cert-run.mts` | done-when (a)~(c) E2E + 오케스트레이터(mock 기본·`--go` fail-loud 스텁) |
| mock 경계 | `test-fixtures/synthesize-cert-mock-realization.ts` | 결정론 mock arm/judge/reference + 합성 full-stratum 2-fixture bench(deletion boundary) |

- 사이드카 거버넌스: run 산출 = `development-records/benchmark/synthesize-cert/<stamp>/`
  (record+capsule **tracked** · `local/` 프로세 사이드카 **gitignore** — `.gitignore:37` 규칙, check-ignore 확인).

## 2. 이 세션이 내린 결정 (owner 재확인 권장 = PROPOSED 표기만)

- **CONFIRMED(핸드오프 §7 허용 대안 그대로)**: capsule binding gate = **신규 sibling validator**.
  shipped `synthesizeCertBindingViolations`(B5 G7)는 손대지 않음 → INVARIANT-CHANGE 이번 세션 발생 0.
  **후속**: B5 등록 시 G7 경로(`scripts/check-supported-models.ts`)가 capsule gate를 호출하도록 배선
  = 그 PR에 `INVARIANT-CHANGE: INV-MODEL-1` 마커. 배선 전까지 이 gate는 **미소비**(inert) — 등록 차단력 없음.
- **CONFIRMED**: `--go` = fail-loud 스텁. 미검증 라이브 코드 제로 방침 — 라이브 realization
  (arm=`createDirectCallReconstructDirectiveAuthor` §5 · judge 독립 lens §7 · quota preflight
  `l2-real-llm-run.mts` 재사용)은 예산 승인 세션에서 한 곳에 배선.
- mock run의 record는 `reproduction.limitations`에 "MOCK RUN — NOT B5 evidence" 명기.

## 3. 다음 작업 (순서)

1. **라이브 realization 배선**(`scripts/b4-cert-run.mts` `--go` 브랜치): arm 3종(baseline gpt-5.5·
   candidate/negative Haiku)·reference(gpt-5.5)·judge(gpt-5.5 또는 opus·전용 프롬프트 §7/§9 note —
   boundary는 의미 특성화 판정, row 매칭은 reconcile 몫) + quota preflight/캡처. — ✅ 완료(2026-07-07 ·
   커밋 f57f408 · --max-calls 캡 기본 800 추가)
2. **owner 예산 승인** 후 라이브 캡처: fixtures 로컬 = #1 `~/Downloads/mbp_2026년 02월_결제 및
   수익인식F_260309.xlsx`(3392b185·앵커) · #2 `~/Downloads/[Day 1] 1.0 (from 20250707) (1).xlsx`(6255aef7).
   forecast ≈500-700콜(§11). 실행 = `--fixture <#1> --fixture <#2> --go`.
3. **R7 사람 큐레이션**(§13 ①~⑧ · capsule + local 사이드카 근거).
4. **production-contrast run**(§13: sampled merge ≥1을 production 경로로, child 저작=Haiku) →
   capsule `production_contrast.completed=true` + evidence_ref.
5. **B5 등록**: record→Haiku 레지스트리 엔트리 + **G7에 capsule gate 배선(INVARIANT-CHANGE 마커)**.
6. B6/B7.

## 4. 검증 스냅샷 (재확인 커맨드)

```
cd /Users/kangmin/cowork/onto-mcp-claude
git log --oneline -9 HEAD            # 58fa1f6 … ada79d2 (S8→S1)
npx vitest run 2>&1 | tail -3        # 2559 passed + 1 todo
npx tsx scripts/b4-cert-run.mts --out /tmp/b4-smoke   # 무지출 스모크: 0-violation + binding clean
```

## 5. 첫 커맨드 (다음 세션 · 모델: 라이브 배선=구현이므로 Fable 5 유지 권장, 리뷰는 다른 KIND)

```
cd /Users/kangmin/cowork/onto-mcp-claude
git fetch origin && git rev-parse --abbrev-ref HEAD && git log --oneline -1 HEAD  # feat/inv-model-1-b4 @ 58fa1f6+
# 이 문서 §3-1부터: --go 라이브 realization 배선 (예산 승인 전 지출 금지 — pre-spend floor 게이트가 1차 방어)
```
