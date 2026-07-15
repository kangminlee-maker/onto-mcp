# §4 백로그 작업 순서(고정) + D1 authority 결정 (2026-07-06)

기준: main `6410547` (#172·#173·#174 머지 후). §4 백로그 원본:
`development-records/handoff/20260705-breaker-observation-and-followups-handoff.md` §4.
실코드 재검증 근거: 메모리 `onto-mcp-s4-backlog-validity-20260706`.

> **잔여 트랙 재검증·해소 (2026-07-15, main `fb987ed`)**. 실코드 재확인 결과 세 잔여
> 트랙 모두 **active 작업 없음**으로 확정 — 열린 항목에서 제외한다:
> - **§4-1·§4-2·§4-6a/b/c**: 전부 착지(별도 세션 검증). §4-6c stance handoff는 `685c27f`로 종결.
> - **§4-4 provider swap**: fallback 배선·default OFF 확실, E2E는 **증거 경계 기록 완료**
>   (design §15/§17): deterministic SDK 429 + injected-primary + real-alternate-provider는
>   DONE, **natural real-provider 429 incident E2E만 기회 대기**(제조 불가). "진행 중"이 아니라
>   달성 가능 증거 경계에 도달한 상태. 승인 시 injected/deterministic을 cert 경계로 수용.
> - **deliberation-response resubmit**: 배선 + **controlled dispatch E2E 발화 관측됨**
>   (`deliberation-resubmit-dispatch.test.ts`: resubmit_applied·"healed by resubmit"·2 invocation).
>   PR #203로 `resubmit.enabled` **기본 활성** → 다음 실 run이 자연 exercise. live-paid 관측만 기회 대기.
> - **관찰 opt-in 4종 DEFAULT 승격**: PR #203 머지(owner-directed, 관찰 게이트 waived).
> - **관찰 승격 사후 관측(3회 무결)**·**A-4 v3 cert run**·**M3 perf 벤치**·**Phase B**만 owner spend/결정 대기.
> - **B6 미착수(아래)는 낡음**: 아래 §2 참조 정정.

## 0. 완료(머지됨)

- §4-7 stance halt progress-step 매핑 — #171
- §4-3(2) matrix 손상 시 fail-loud — #173 (`review/pipeline-execution-ledger.ts:677-688`)
- §4-8 IMPLEMENTATION_MAP 재구축 — #174

## 1. 고정된 의존성 순서표

레인 A = breaker·회복·ledger 축(INV-MODEL-1 무관, 이 세션 진행 안전).
레인 B = 모델선택·레지스트리·벤치 축(INV-MODEL-1 B5~B7 종속).

| 순서 | 항목 | 레인 | 착수 게이트 | 비고 |
|---|---|---|---|---|
| W0 | **D1 authority SSOT 결정** | A | 없음(즉시) | §4-2·§4-3(1) 동시 해제. 본 문서 §3 |
| ✅ | §4-1 nested breaker 커버 | A | — | **구현 완료**(2026-07-06, 미커밋). 본 문서 §5 |
| W0 | §4-6a resubmit 확대 | A | 무의존 | 별개 서브시스템 |
| — | §4-2 자동 재개 소비 | **B** | **이연**(레인 B 재분류, 2026-07-06) | 실제 갭=reconstruct semantic-map 자동재개, 아티팩트가 유일 authority(리뷰 아님). B4/B5 조율. 본 문서 §4 |
| — | §4-3(1) per-unit 강등 마커 | A | **보류(consumer-gated)** | D1b=지금 추가 안 함. 실 소비자 특정 시에만 파생 projection |
| W1′ | §4-6c 티어링 정책값 | B | **B5 머지 후**(검증 중) | seat 체인 위 override. Haiku tier면 B5 레지스트리 엔트리 필수(G7) |
| W2 | §4-6b onto_review_continue 기본화 | A | §4-2 방향 후 | UX/문서 |
| W3 | §4-4 provider 스왑+family-collapse | B | **D1 + B7 후**(B7 미착수) | 이중 게이트 — 전체 최후 sink. 스왑만 배선 시 inert, 소비자까지 동반 |
| — | ~~§4-5 semantic-map l2 재실행~~ | B | **흡수 종료** | B4 머지=하니스 확보, B5 검증=재실행. 별도 §4 작업 아님 |

임계 경로: 레인 A는 §4-2 이연 후 `§4-1`(W0)이 실효 선두. 레인 B 최장 `D1 + B7(미착수) → §4-4`.
현재 착수: **§4-1 nested breaker 커버**(2026-07-06).

## 2. INV-MODEL-1 종속 레인 현황 (2026-07-06)

타 세션 진행 중. 브랜치 `feat/inv-model-1-role-aware`, 워크트리 `~/cowork/onto-mcp-l2wire`
(= §4-5 아티팩트 위치).

- B1~B3 (레지스트리 role 스키마·seat·settings 소스층 재구조화): **main 머지**(#165).
- B4 (§6 벤치 하니스·`semantic_map_synthesize` record·G7 재계산): **머지**.
- B5 record 검증기(synthesize-cert/v1 + G7 role↔record 결속): **머지**(#176, `discovery/synthesize-cert-record.ts`).
  단 **Haiku 레지스트리 엔트리는 미착지** — `supported-models.yaml`은 `gpt-5.5`·`claude-opus-4-8`뿐.
- B6 (INVARIANTS·G4 패턴·matcher export·문서): ~~미착수~~ **대부분 흡수(2026-07-15 재검증)** —
  INVARIANTS·G4 마커·문서 부분은 B7과 함께 착지(`INVARIANTS.md` INV-MODEL-1 §48/52/98/101,
  커밋 `d788da8`/`274d446`). 미착지는 독립 role matcher export뿐이나 소비자 없음(**YAGNI** —
  G7·CONTRACTED_ROLES가 role 판정을 이미 소유). non-load-bearing 잔여.
- B7 (benchCandidate scoped capability·allowlist·구조 가드·양성 소비자): 미착수.

종속 매핑: §4-5→B4/B5(흡수), §4-6c→Haiku 엔트리(미착지) + B7, §4-2→B4/B5(reconstruct semantic-map 경로), §4-4→B1(family)+B7(allowlist).

## 3. D1 — 회복·강등 신호 authority SSOT 결정

### 3.1 확정 원칙 (SSOT §8 + capability-boundary 가이드에서 도출, 재확인 불요)

**하나의 primary authority + 파생 projection.** 신규 표면은 기존 단일 권위의 파생물이며
경쟁 권위가 되지 않는다.

- 근거(가이드): "assign each field or operation one primary authority, then add layered
  checks"; Deterministic Projection("직접 파생 아티팩트는 runtime-owned projection");
  Single Source Of Truth("단일 canonical source에서 나머지를 유도, 불가 시 권위를 명시하고
  drift-catching 테스트 추가").
- 회복셋 권위 = **continuation frontier / ledger**. frontier가 ledger에서 회복셋을 독립
  재계산한다(`review/continuation-plan.ts:77-91`, `isResolvedLedgerUnit`→`isFrontierUnit`).
  `dispatch-incomplete.yaml`은 결정적 projection·disclosure이다
  (`llm/dispatch-breaker.ts:400-429`, `incomplete_item_ids = planned − completed − deadletter`).
- 강등 권위 = **matrix `validation.missing_stances` → ledger `resolution:"demoted"`**.
  설계 SSOT §8(82-84행): "이 강등은 durable ledger authority를 갖는다 … stance matrix의
  `validation.missing_stances`를 읽어 … `resolution`을 `demoted`로 못박고". #173이 이 단일
  권위의 읽기를 fail-loud로 강화(손상 시 조용한 빈 집합 대신 throw).

### 3.2 잔여 결정 2건 — owner 확정 (2026-07-06)

**D1a — §4-2 재개 시 회복셋 SOURCE → (A) frontier 재계산 확정.**
재개 시 ledger를 다시 읽어 미완료 집합을 도출한다. `dispatch-incomplete.yaml`은 참고/공시로만
두고 재개 source로 쓰지 않는다. 단일 권위 유지, SSOT §8 일치. (기각: 아티팩트 직접 소비 —
회복셋의 두 번째 진실원·trip↔resume 간 ledger 변화 시 어긋남.)

**D1b — §4-3(1) per-unit 강등 마커 → (A) 지금 추가 안 함 확정.**
matrix→ledger 단일 권위로 충분하다. 실행결과 레이어에서 강등을 구별해야 하는 **실 소비자를
특정한 뒤에만** 파생 projection으로 추가한다(현재 execution-result의 강등 유닛을 읽어 구별하는
소비자 없음 → inert 필드 회피). (기각: 지금 파생 필드 추가 — 소비자 부재로 inert / primary
권위 승격 — SSOT §8·#173과 이중 권위 충돌.)

### 3.3 확정된 구현 계약 (§4-2 / §4-3(1))

- **§4-2**: "아티팩트를 읽어 재개"가 아니라 "**frontier를 재도출해 재개**"로 구현. ledger→frontier
  재계산이 회복셋 authority이며, `dispatch-incomplete.yaml` 소비 배선은 금지(projection 지위 유지).
- **§4-3(1)**: **consumer-gated 보류.** 실행결과 레이어에서 강등을 구별할 실 소비자가 나타나기
  전까지 착수하지 않는다. 나타나면 matrix/ledger에서 유도하는 파생 projection + drift 테스트로만
  구현하고, ledger의 matrix 재독(단일 권위)을 대체하지 않는다.

> 상태: D1 **전체 확정**(§3.1 원칙 + §3.2 D1a·D1b + §3.3 계약). §4-3(1)은 consumer-gated 보류.
> §4-2는 §4에서 재스코프됨(아래).

## 4. §4-2 재스코프 + D1a 정정 (owner ① 확정 2026-07-06)

§4-2 착수 중 실코드 발견으로 전제가 바뀌었다. §4-2를 **이연**하고 레인 B로 재분류한다.

**발견 (근거):**
- §4-2의 "자동 스테이지 재개"의 실제 갭은 리뷰가 아니라 **reconstruct semantic-map 배치**다.
  breaker는 reconstruct에만 배선되고(`reconstruct/run.ts` `batchLabel:"semantic-map"`), 리뷰 측
  배선은 설계 §8에서 이연(리뷰는 continuation frontier로 이미 회복). breaker 주석 rule 5:
  "automatic stage-level resume from the artifact is a deferred later cut (§8)".
- reconstruct엔 재도출할 **아이템 단위 frontier가 없다** — ledger는 `ReconstructStageId` 스테이지
  단위 audit이고 "the live run never consumes the ledger". 아이템 단위 미완료셋의 유일 기록은
  `dispatch-incomplete.yaml`(존재 이유: "§1.2 34-item loss happened because this list did not exist").
- 그 아티팩트를 읽는 소비 코드는 **비테스트 src 0곳**(자동 재개 미배선 확정).

**D1a 정정:** D1a("frontier 재도출, 아티팩트 소비 금지")는 **리뷰 아키텍처 기준**이었다. 실제
대상인 reconstruct엔 재도출할 frontier가 없어 적용 불가하다. **D1a 원칙(단일 authority)은 유지**:
리뷰에선 frontier가 authority(아티팩트=잉여 projection→소비 금지 맞음), reconstruct에선
**아티팩트가 유일 authority**(→ 자동 재개가 이를 소비하는 것이 원칙 준수). 문구 "소비 금지"는
리뷰에만 한정한다.

**결정:** §4-2 이연. reconstruct auto-resume는 semantic-map 경로라 진행 중인 B4/B5(INV-MODEL-1)와
겹치므로 그 세션과 조율(레인 B). 재개 시 구현 계약 = "dispatch-incomplete.yaml을 단일 authority로
소비, default-off(`semantic_map_authoring` off) 뒤 배선". 이 세션은 §4-1로 전환.

## 5. §4-1 구현 기록 (2026-07-06, 미커밋)

리뷰 dispatch breaker를 nested-workers 풀(lens·stance)까지 커버.

**핵심 규칙:** 배치-창 결과(배치성공·zero-retry 확정 실패)는 실 디스패치가 아니므로
`recordItemSkipped`(완료 집계, 계통 streak 불변)로 기록하고, 배치-실패 유닛의 flat 재시도만
`recordItemSuccess/Failure`로 streak을 구동한다. "내가 직접 안 본 성공은 provider 건강 증거로
쓰지 않는다" — 배치-창의 철 지난 성공이 outage streak을 리셋하는 것 차단.

**변경 (`src/core-runtime/cli/run-review-prompt-execution.ts`):**
- `ExecutionOutcome.nestedBatchWindow?: true` — combinator `unitOutcomeWithNestedFirstAttempt`의
  배치-창 두 분기(배치성공·zero-budget실패)에만 표시. flat 재시도/미참여는 무태그.
- `recordNestedUnitOutcomeToBreaker(breaker, outcome)` 헬퍼 — 태그면 skipped, 아니면 성공/실패.
  stance 루프·lens flat-fallback 공통 사용.
- 두 풀 breaker 생성 가드(`stanceNestedBatch === undefined`/`nestedLensWorkerExecutor === null`)
  제거 → opt-in이면 항상 생성.
- 트립-스킵: nested에서 이미 성공한 유닛은 트립 후에도 처리(skipped 기록, 무디스패치)하고,
  새 flat 디스패치를 만드는 유닛만 건너뜀(미기록 시 incomplete 오집계 방지).
- lens nested 브랜치: 배치성공→skipped, flat-fallback→헬퍼, zero-budget→skipped, 트립 시
  flat-fallback 중단.

**default-off 보존:** `dispatch_breaker.enabled=false`(기본)이면 breaker=null → 모든 `?.` no-op,
가드 제거 전후 동일(null). nested OFF 경로 byte-무변경.

**검증:** typecheck PASS · vitest 전체 2499 PASS(1 todo) · 조합기 태그 단위테스트 + 헬퍼
행동테스트(**음성 대조군**: 실 flat 성공은 streak 리셋, 배치-창 성공은 안 함) ·
flat-mode breaker E2E(stance/lens 트립·OFF twin) 회귀 PASS · import-boundary·러너 컨포먼스 PASS.
계약 `prompt-execution-runner-contract.md` 카브아웃 갱신.

**검증 gap:** nested-workers 러너를 실제로 태우는 E2E 하니스는 미존재(기존 하니스는 main-workers).
러너 배선은 코드 인스펙션 + 컴포넌트 단위테스트로 검증. nested E2E 하니스는 후속.

## 6. §4-1 교차검증 (2026-07-07, 독립 3렌즈 적대 리뷰)

렌즈: (1) 정확성/엣지케이스 (2) 동시성/순서 (3) 계약·관계 정합. 대상 `origin/main..HEAD`.

**Material 수정 완료:**
- **F1 [수렴 3렌즈] 태그 누수** — `executeIssueStanceUnit`의 배치-ok→on-disk 검증실패 재방출이
  `{...outcome}` 스프레드로 `nestedBatchWindow:true`를 보존 → 헬퍼가 skipped 오분류(flat은
  dead-letter). **수정:** 검증실패 재방출 시 태그 destructure-omit. 회귀 테스트 추가(배치-ok +
  응답파일 부재 → 태그 벗겨진 실패 → dead-letter 확인).
- **F2 stale 주석** — `dispatch-breaker.ts` 헤더가 "nested-workers … NOT covered"라 §4-1로 stale.
  **수정:** 헤더를 nested 커버(배치-창=skipped, flat 재시도만 streak) 반영으로 갱신.

**Non-material (문서화, 미변경):**
- Finding A [low] zero-retry(maxRetries=0) nested 배치실패의 flat/nested 회복셋 라벨 비대칭
  (nested=completed vs flat=incomplete-victim). `recordItemSkipped` 계약이 "budget cap"을 skip으로
  명시 승인, 비기본 설정, 런타임 회복은 execution-result frontier가 독립 보상 → 비차단.
- F4 [low] 규칙 3중 구현(lens 인라인 / stance 헬퍼 / flat 직접) drift 위험 — 4경로 의미 일치 검증됨,
  유지보수 권고.

**남은 검증 gap (F3, disclosed):** nested-workers 러너를 통째로 태우는 통합 테스트 부재. 하니스가
`main-workers` 고정이고 lens nested(`executeReviewViaNestedBatch`)는 러너 진입점에서 주입 불가라
주입 seam 추가(러너 시그니처 변경)가 필요 — 별도 후속. 현 커버: 조합기 태그·헬퍼 규칙(음성 대조)·
F1 회귀 단위테스트 + 전체 2500 회귀 + flat-mode breaker E2E.

검증: typecheck PASS · vitest 2500 PASS · import-boundary·러너 컨포먼스 PASS.

## 7. §4-1 Codex 교차검증 (2026-07-07, 다른 모델 패밀리 = OpenAI)

`$ultracode-for-codex`(4-agent fan-out, ChatGPT 인증). Claude 3렌즈의 same-family 한계를
보완하는 diverse 검증. 리뷰 전용(소스 미수정, worktree clean 확인).

**Material 수정 완료:**
- **Codex F2 [medium, §4-1 도입]** — lens nested 배치-ok→parent `validateUnitOutputFile` 실패 +
  `lens_max_retries=0`이면 실패 lens를 dead-letter가 아니라 skipped/completed로 기록(stance F1
  fix의 lens 짝을 놓침). **수정:** lens zero-budget 실패를 헬퍼 경유 `recordItemFailure`로.
- **Finding A [내 리뷰서 low→Codex 수렴으로 승격]** — zero-budget 배치실패의 flat/nested 회복셋
  비대칭. **함께 수정:** 헬퍼 규칙을 "배치-창 SUCCESS만 skipped, FAILURE는 flat처럼
  recordItemFailure(item-local→dead-letter, 계통→회복 victim)"로 변경. lens 배치-ok 성공도 태그+
  헬퍼로 통일(F4 drift도 해소). 테스트 재작성(배치-창 실패→dead-letter/victim, 성공→skipped 유지).

**Pre-existing 공시 (§4-1 범위 밖, 별도 후속):**
- **Codex F1 [high, PRE-EXISTING]** — 동시 stance/lens 풀에서 breaker 판정이 completion-order에
  의존(같은 outcome 집합이 순서에 따라 trip/incomplete 상이). `recordItemSuccess`가 pre-trip에
  `pendingSystemic`을 flush하기 때문. **git 확인:** `origin/main`에도 concurrent 풀
  (`Promise.all`)+`recordItemSuccess`가 이미 존재 — §4-1이 도입한 게 아니다. breaker 상태기계는
  post-trip 레이스만 freeze로 처리하고 pre-trip 인터리브는 미처리. 결정성 개선은 breaker 관측을
  deterministic dispatch order/wave로 투영하는 별도 변경(flat 모드도 영향). §4-1에 번들하지 않음.

**모델 다양성:** author=Claude, verifier=Codex(OpenAI) → 진짜 cross-family(collapse 아님).

검증: typecheck PASS · vitest 2500 PASS · 헬퍼 규칙 단위테스트(배치-창 실패 분류·성공 skip·음성
대조)· F1 회귀테스트 · flat-mode E2E 회귀 · import-boundary·러너 컨포먼스 PASS.

## 8. §4-1 onto-lens 교차검증 (2026-07-07, ultracode Workflow × onto 렌즈 taxonomy)

onto MCP 제품 리뷰는 **서버 stale로 차단**(설치 서버가 repo보다 옛 빌드 — 현재 settings 키 거부 +
diffRange를 파일 target에만 허용하며 그 경로를 git cwd로 써 ENOTDIR). 대신 `onto_list`로 onto
정식 렌즈 taxonomy(logic·semantics·pragmatics·coverage·dependency·evolution)를 확보해 ultracode
Workflow의 6개 적대 렌즈로 구성 → 각 material finding을 실코드로 adversarial 재검증(기본 REFUTED).
HEAD b456675 대상. 10 에이전트, 0 오류.

**CONFIRMED material 1건 (coverage·dependency 두 렌즈 수렴, §4-1 도입):**
- **stance/lens post-trip 비대칭** — 트립 후, zero-retry(`issue_artifact_max_retries=0`) 배치 실패
  유닛을 stance 풀(가드 `tripped() && !stanceBatchOk`)은 스킵→incomplete로 남기는데, lens 풀은
  `recordItemFailure`로 분류(item-local→dead-letter). 동일 상황이 두 풀에서 dead-letter vs
  incomplete로 갈리고, 동시 stance 풀에선 트립 전/후 스케줄에 따라 비결정적. 계약(nested 균일
  규칙: item-local→dead-letter)에서 stance가 이탈. **수정:** stance 트립-스킵을 "새 flat 디스패치를
  빚지는 유닛만"으로 정정 — batch-ok·zero-retry 배치실패(디스패치 안 빚음)는 트립 후에도 처리해
  helper로 기록·분류. 기본 설정(retries=2)에선 동작 동일(회귀 0), corner case(retries=0)만 정정.

**비material(문서화):** logic/semantics/coverage/evolution 각 1건(low/info) — 재보고 불요 항목·주석
정합 등. pragmatics/dependency 추가 material 없음(공시된 pre-existing 동시성 외).

**남은 gap:** 루프-레벨 트립-게이팅(stance/lens 양 풀)의 통합 테스트 부재 — nested-workers 러너
하니스 필요(F3와 동일 클래스). 분류 동작(zero-budget item-local→dead-letter)은 helper 테스트로 커버.

**교차검증 3중 요약:** Claude 3렌즈(F1) → Codex/OpenAI 4-agent(F2·Finding A) → onto-lens ultracode
6렌즈(stance/lens 비대칭). 각 KIND가 앞이 놓친 것을 잡음 — cross-family·cross-taxonomy 다양성의 실증.

검증: typecheck PASS · vitest 2500 PASS · import-boundary·러너 컨포먼스 PASS.
