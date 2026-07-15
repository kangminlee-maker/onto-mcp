# Owner-spend 착수 start-here (2026-07-15): A-4 v3 cert run · M3 perf 벤치 · 승격 사후 관측

이 세션의 무-spend 작업은 전부 소진·머지됨(cert v3 Phase A+V2, breaker-observation 승격 #203,
§4 잔여 트랙 해소, IMPLEMENTATION_MAP 전면 갱신). 남은 건 **owner spend/결정 3건**. 이 문서는
`/clear` 후 각 건을 착수할 수 있게 명령·전제·비용·판정기준을 고정한다.

## 재개 시 상태 검증 (먼저 실행)
```
pwd                                  # /Users/kangmin/Documents/onto-mcp
git branch --show-current            # main
git fetch origin main && git rev-parse --short origin/main
npx vitest run 2>&1 | tail -3        # 2989 pass 여야 (릴리스 후엔 버전만 다름)
```
착수 전제(공통): 각 항목은 **실코드로 재검증**(핸드오프 주장은 가설). LIVE spend 전 rehearsal/
N=1로 경로 확인. 라이브 배치는 코드-레벨 서킷브레이커/쿼터 보호 있음(review-cert-run은 per-review
timeout + `--resume` 복구; 벤치는 output-buffer/timeout).

---

## 1. A-4 — v3 fresh cert run (owner spend, LIVE)

**목적**: cert v3 신규 fixture(clean-target G1·shared-root G2)로 **G1/G2 부하 check를 실 모델에서
처음 측정(disclosure)**. 등록 authority는 안 바꾼다(신규 부하는 non-core disclosure). 결과가
D4 승격 트리거(§D4) 입력이 된다.

**대상 모델 = 등록된 review 모델 2종** (`.onto/authority/supported-models.yaml` `roles:[review]`):
- `anthropic/claude-fable-5` (oauth → claude_code 라우트; **claude shim 필요** — witness_missing fail-loud)
- `openai/gpt-5.6-sol` @ **medium** (oauth → codex 라우트)

baseline arm = `openai/gpt-5.5` (기존 2 cert와 동일 기준).

**명령 (모델당 1 run, 2-arm)**:
```
# fable-5 (claude route)
npx tsx scripts/review-cert-run.mts \
  --candidate-model claude-fable-5 --candidate-effort high --candidate-provider anthropic --candidate-auth oauth \
  --baseline-model gpt-5.5 --baseline-effort low --baseline-provider openai --baseline-auth oauth \
  --reps 3
# sol@medium (codex route)
npx tsx scripts/review-cert-run.mts \
  --candidate-model gpt-5.6-sol --candidate-effort medium --candidate-provider openai --candidate-auth oauth \
  --baseline-model gpt-5.5 --baseline-effort low --baseline-provider openai --baseline-auth oauth \
  --reps 3
```
`--out` 생략 시 `development-records/benchmark/review-cert/<stamp>/`. 절단 시 `--resume <prior-out>`.

**비용**: run당 arm 2 × fixture **4** × reps 3 = **24 ok run** (+ `--max-attempts` 기본 reps+2 재시도分).
2종 전부면 ~48. (설계 D6의 "18/1.5×"는 3-fixture 기준 오기 → 4-fixture/2× 정정 커밋됨.)

**전제/주의**:
- salvage/resubmit pin: 하니스가 `--retry-resubmit` + `--no-salvage`를 매 호출 전달 → temp-project는
  resubmit ON·salvage OFF(raw 측정). startup mechanical 프로브가 이를 검증(fail-loud).
- fable-5는 claude shim 필요. sol은 codex OAuth(ChatGPT usage limit에 절단 이력 있음 → `--resume` 대비).
- **선행조건 해소됨**: "사전-unit 10분 hang"은 첫 유닛 `lens`의 라이브 LLM 콜이 per-review 데드라인
  히트한 I/O-wait 시그니처(코드 hang 아님). timeout+resume로 복구.

**판정(D4 승격 트리거, §D4)**: 어떤 신규 부하 check가 (a) baseline arm ≥3 rep 전부 PASS +
(b) 최소 1회 candidate<baseline 변별 → 다음 이터레이션 owner가 core floor 편입 결정. 미달 시
disclosure 유지(맹목 floor 금지). 첫 run은 **disclosure**이며 등록 authority 불변 —
record `reproduction.limitations`에 명시.

**Q2/Q3(설계 §4, 기본값)**: Q2 기존 2 fixture baseline 재실행=**전면 재실행**. Q3 신규 부하
core floor 승격=**D4 트리거**(첫 run disclosure).

**정직한 한계(불변)**: core recall 4종 중 grounding·final_result·artifact recall 3종은 실 완주
run에서 무발화 이력 → 하한이 합성 테스트로만 성립. A-4로도 안 바뀜(v3 비목표).

---

## 2. M3 — 모델 성능·특성 벤치마크 (owner spend, cert 게이트와 분리)

**목적**(owner 지시 2026-07-12): 인증(pass/fail)이 아니라 **스펙트럼 변별**(미달~상회)·**모델 특성
프로파일** 비교. 후보 축: ontology ground-truth fixture 4종(`fixtures/ontology/`, seeded-defect
graded 채점)·reps/fixture 확대로 분해능 상향·특성 축(resubmit 의존도 disclosure).

**명령 골격**(`scripts/review-pipeline-benchmark.ts`):
```
npm run benchmark:review:pipeline -- --runs 3 --fixture <id> --fixture <id2> \
  --model <m> --provider <p> --auth <a> --case all-<effort> --output <path>
```
fixture: `review-pipeline-target-v1`·`retry-policy-target-v1`·`clean-target-v1`·`shared-root-target-v1`
(cert 4종) — M3는 여기에 ontology fixture graded 채점 축 추가가 후속 설계.

**⚠️ 이번 승격(#203)의 M3 영향**: 표준 벤치를 `--retry-resubmit`/`--no-salvage` 없이 돌리면 이제
resubmit·salvage·breaker가 **default ON으로 측정**된다(승격 전엔 OFF). 특성 프로파일(resubmit
의존도 등)을 원 상태로 재려면 명시적으로 OFF 오버레이 필요 — M3 설계 시 반영.

**상태**: 설계 미완(후속). 백로그 M3, 인증 게이트 M4와 분리.

---

## 3. 승격 사후 관측 3회 (선택 — waived 게이트 정당화)

**배경**: PR #203이 breaker-observation opt-in 5종을 default ON 승격했으나, 설계 게이트
(`20260705-breaker-observation-and-followups-handoff.md §3` = 실 리뷰+실 reconstruct **3회 무결**)는
**0/3에서 owner-directed로 waived**(evidence-backed 아님). 사후에 관측을 채우면 승격을 정당화할 수 있다.

**대상**(4키 + salvage는 별개): 실 review 실행(resubmit + review breaker) + 실 reconstruct 실행
(breaker + semantic_map_authoring)을 **3회** 돌리고 아래 확인:
- resubmit: `runner stance resubmit` 로그·치유율, degradation-summary/matrix 공시 정합, halt율,
  `correlated_validation` 오발. (deliberation resubmit는 이미 controlled dispatch E2E로 발화 관측됨
  — `deliberation-resubmit-dispatch.test`; live에서 자연 exercise 확인)
- review breaker: 트립/포이즌 정합, `dispatch-incomplete.yaml` 내용, 완료 유닛 보존, 회복
  재디스패치 == 미완료 집합, 실 claude_code CLI limit 문구가 RATE_LIMIT 패턴 매칭
- reconstruct breaker: census `breaker_retry_*` spend, 트립 파티션 정합
- semantic-map: census/projection 품질, 429 중 부분출력 seat 신뢰(`trustedOnSeatPresence` caveat)

**주의**: #179/#182로 resubmit 표면이 바뀌어 이전 관찰 무효 → #182 이후 실행부터 0에서 센다.
default가 이제 ON이라 실 run이 자연히 관찰 대상을 exercise한다.

**결과**: 3회 무결이면 승격이 사후 evidence-backed로 정당화됨(추가 PR 불요 — 이미 ON). 결함
발견 시 disclosure 또는 롤백 판단.

---

## 관련 메모리
- [[onto-mcp-breaker-observation-default-promotion-20260715]] — 승격 결정·파급·가드 보강
- [[onto-mcp-cert-v3-a3-progress-20260713]] — cert v3 A-3·A-4 대상·비용
- [[onto-mcp-cert-gate-fixture-mece-20260712]] — 인증게이트/성능벤치(M3) 분리·주입형 expectations 규칙
- [[onto-mcp-s4-backlog-validity-20260706]] — §4 잔여 트랙 재검증·해소(2026-07-15)

## 설계 SSOT
- cert v3: `development-records/design/20260712-review-cert-v3-fixture-mece-design.md` (§D4 승격 트리거·§4 Q1~Q3)
- 승격 게이트: `development-records/handoff/20260705-breaker-observation-and-followups-handoff.md §3`
