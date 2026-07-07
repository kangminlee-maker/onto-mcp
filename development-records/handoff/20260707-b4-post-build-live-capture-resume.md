# RESUME: INV-MODEL-1 B4 — 하니스 빌드 완료 → 라이브 캡처 (예산 승인 후)

> 앞 세션(2026-07-07 · Fable 5)이 design v3 §15 S1~S8 하니스를 **빌드 완료 + mock E2E 무지출 실증**.
> 이 문서 = clear 후 라이브 캡처 세션의 START-HERE. SSOT =
> `development-records/design/20260706-b4-r8-harness-design.md`(v3·헤더에 빌드 상태).

## B4 종결 상태 (2026-07-07)

- **grounding 질문 해소**: Haiku grounding은 gpt-5.5와 사실상 동률(편향 없는 결정론 구조검증
  **candidate 0.989 vs baseline 1.000** — 89건 중 진짜 날조 1건). 원 벤치 gap(candidate 0.889 <
  baseline 1.0)은 **동일-패밀리 judge 편향**(judge=gpt-5.5=baseline)이었음 — opus 재채점
  (0.889→1.000) + 구조화-추출로 확정. 방법 자기검증 = negative_control 0.500 ≪ candidate(주입된
  변이 45건 포착).
- **경로 요약**: 라이브 561콜(첫 런 46% 지점 hang → `--resume`로 복구 완주) → `metric_regression`
  발견 → opus 재채점(동일-패밀리 편향 확인) → R7 사람 감사 추출 → 구조화-추출 grounding(LLM은
  추출만·판정은 결정론) → verifier 구조-전용 수정(어휘 거짓양성 제거·domain-agnostic 원칙).
- **커밋 체인**(branch `feat/inv-model-1-b4` · 미푸시): `f57f408`(--go 배선) · `a3709c3`(--resume) ·
  `bf4f8e6`(opus 재채점 + R7 감사) · `f98b5fd`(R7 추출기) · `646ffa6`(구조화-추출 grounding 판정).
- **boundary caveat (owner 결정)**: cert record는 boundary `metric_regression`(candidate 0.967 <
  baseline 1.0)으로 미박제이나, 이는 **degenerate 메트릭**(negative_control 0.978 ≈ candidate ·
  no-seam 입력은 boundary 레버가 inert · 설계 §6에서 이미 예견)이고 **judge 편향이 아님**(gpt-5.5·
  opus 둘 다 0.967로 동일). 구조적 boundary-날조(seam 없는 곳에 전환을 주장하는 경우)는 이미
  결정론 grounding(0.989)에 포함되어 잡힌다. owner 결정 = 이 `metric_regression`을 **문서화된
  degenerate-metric caveat로 남기고, grounding 증거를 근거로 등록을 추진**한다. shipped
  `synthesize-cert-record.ts`의 게이트는 불변이라 표준 record 박제는 불가능 — 등록 evidence 기반은
  `structured-grounding-comparison.json` + 이 caveat.
- **남은 경로 → B5**:
  ④ production-contrast run(§13 — sampled merge를 production accumulate→reconcile→verify 경로로,
  child 저작=Haiku, 별도 라이브 지출 필요)
  ⑤ B5 등록(`supported-models.yaml`에 Haiku 엔트리 + G7 배선 = `INVARIANT-CHANGE: INV-MODEL-1`
  마커 · evidence = structured-grounding 증거 + 이 caveat)
  ⑥ B6/B7.
- **★ 방법론 교훈**: 결정론 verifier가 owner(Fable)의 손분석 맹점을 3회 포착했다 — case 7의
  자식-경계 오판, integer/INT 어휘 불일치, 전환-라벨 어휘 불일치. LLM judge 단독이었다면 이 세
  가지가 전부 묻혔을 것. verifier = 구조(행·경계·전환 위치)만 판정, 명명은 LLM의 의미 잔차로
  남긴다.
- **첫 커맨드(다음 세션)**:
  ```
  cd /Users/kangmin/cowork/onto-mcp-claude && git fetch origin && git log --oneline -6 HEAD
  ```

## 0. 지금 어디인가 (CONFIRMED @ 2026-07-07)

- branch `feat/inv-model-1-b4` · 빌드 커밋 9개 `ada79d2`(S1)→`58fa1f6`(S8) · 미푸시.
- **full vitest = 2559 passed + 1 todo (158 파일·회귀0·baseline 2495+신규 64)** — 이 세션 실측.
- 정적 게이트 전부 통과: ts-core · import-boundary · invariant-drift · spec-defaults ·
  invariant-change(protected_changes 0 — **shipped `synthesize-cert-record.ts` 이번 빌드에서 불변**).
- 라이브 배선 완료(2026-07-07): --go = 실좌석 배선·quota probe·cap 게이트. 남은 순서 = §3 2~6. + --resume <runDir> 재개 레버(freeze-checkpoint·중도 실패 시 기지출 보존, 커밋 a3709c3)

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
