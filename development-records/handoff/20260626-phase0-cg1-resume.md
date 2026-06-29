# RESUME — Phase 0 CG-1 (authoring prompt-template identity → resume reuse key)

> ⛔ **SUPERSEDED (2026-06-27)** — CG-1 완료(`e868fa4`)·judge-model fold(`09de149`)·P0 종결. **현 START-HERE = `development-records/handoff/20260627-p1-start-resume.md`(P1).** 이 문서는 CG-1 이력으로만 보존.

> **START-HERE.** `/clear` 후 fresh 세션이 **이 문서 하나로** CG-1을 이어받는다. 날짜 2026-06-26. 브랜치 `feat/comprehension-cut2-de-risk`. HEAD=`86debbf`.
> CG-1은 **CG-2(`0f04116`)의 직접 후속·동형 패턴**. 설계 재론 금지 — 구현만.

## 현 상태 (한 줄)
재절단 comprehension 엔진 **설계+de-risk Cut-1~4b 종결**(전부 교차검증 게이트 통과; SSOT=`development-records/design/20260625-rescoped-comprehension-engine-design.md` §7.1~§7.6·§10.4~§10.9). **production 배선 3-Phase 시작**: P0(shipping DET-1 fix)→P1(엔진 MVP sidecar)→P2(이연). **✅ P0 CG-2 완료**(resume 키에 authoring-model identity fold). **▶ 지금=P0 CG-1**(authoring prompt-template identity fold) + llm-touch coverage validator.

## CG-1이 고치는 버그 (게이트 §10.8/§7.6 발견)
reconstruct resume 키(`authoredArtifactReuseMatch`)가 **authoring 시스템 프롬프트를 안 접음**. authoring 프롬프트(`baseSystem` + ~38개 stage `systemPrompt:` 배열)가 directive/seed/claim/lens 단계를 구동하는데, 키엔 `competency_question_assessment_projection_contract_sha256` 1개만 fold됨. → **런 중단 후 authoring 프롬프트를 편집하고 재개하면 옛 프롬프트로 만든 산출물을 silent 재사용**(CG-2의 모델 버전, 같은 부류).

## ★ sound fix 원칙 (비협상)
- **수동 버전 문자열 금지** — "bump 잊으면 stale"이라 DET-1 재설계가 거부한 바로 그 안티패턴. **실제 프롬프트 문자열을 *자동* 해시**해야 sound(편집=해시 자동 변경).
- 따라서 inline 프롬프트의 *정적 템플릿 부분*(per-call 데이터 제외)을 **hashable catalog로 들어올려** 자동 해시. 미러 대상 = 이미 있는 `competencyQuestionAssessmentProjectionContractSha256()` (run.ts:815) 패턴.

## 구현 (CG-2 동형 — `0f04116` 디프가 템플릿)
1. **authoring 프롬프트 catalog + 자동 sha** (신규, 예: `src/core-runtime/reconstruct/authoring-prompt-contract.ts` 또는 run.ts 내 모듈 상수):
   - `baseSystem`(run.ts:6544) + 각 stage `systemPrompt:` 배열(38 사이트)의 **정적 문자열 부분**을 catalog 상수로 모음(per-call 동적 토큰[관찰 id·예산·limit 수치]은 *데이터*라 제외 — 템플릿 identity만).
   - `authoringPromptContractSha256()` = `sha256Text(stableJson(catalog))` (competency 패턴 동형) + `AUTHORING_PROMPT_CONTRACT_VERSION` 상수.
   - ⚠️ catalog가 **실제로 stage들이 쓰는 문자열과 동일**해야 함(중복 정의 시 drift). 안전책: stage가 catalog를 *참조*해 prompt 조립하게 리팩토링(가장 sound·약간 더 큰 손) **또는** stage 프롬프트를 그대로 두되 catalog가 그 문자열의 single-source가 되도록(편집 시 catalog도 닿게). 후자가 빠르나 drift 위험 → coverage validator(아래)로 가드.
2. **reuse-match에 fold** (CG-2 자리 바로 옆):
   - 인터페이스(run.ts:750 `semantic_author_model_identity` 근처)에 `authoring_prompt_contract_sha256: string;` 추가.
   - builder(run.ts:1268 fold 자리)에 `authoring_prompt_contract_sha256: authoringPromptContractSha256(),` 추가. (모델 identity와 달리 프롬프트 catalog는 *모듈-static*이라 author 인스턴스 안 거치고 builder서 직접 호출 가능 — CG-2보다 단순.)
3. **llm-touch coverage validator (선언 카탈로그)**:
   - catalog가 *알려진 모든 authoring stage*를 커버하는지 정적 검사·**fail-closed**(새 authoring `systemPrompt:` 사이트가 catalog 누락 시 가드/테스트 실패). dependency-discovery 자동화는 이연(Cut-4a 게이트), 선언 카탈로그+가드부터.
   - 형태: `run.test.ts` 가드 테스트 또는 `scripts/` 체크 — 38 systemPrompt 사이트 수 ↔ catalog 엔트리 수 일치 등.

## 테스트 (CG-2 테스트 미러 = run.test.ts:5832 "authoring model identity differs")
- **(a)** 단위: `authoringPromptContractSha256()` 결정성(같은 catalog→같은 sha·재실행 안정).
- **(b)** 회귀: reuse 키에 prompt sha가 fold됨을 입증. CG-2 테스트는 model_id 회전으로 mismatch 유도 — CG-1은 prompt-contract 회전을 유도해야. catalog가 상수라 테스트서 편집이 어려우면: `AUTHORING_PROMPT_CONTRACT_VERSION`을 *테스트 주입 가능*하게 하거나, builder가 prompt-sha를 키에 넣는지 직접 단언(두 run 사이 catalog 다르게 monkeypatch). 가장 단순 = 단위로 "prompt 문자열 1개 바꾸면 sha 변함" + 통합으로 "sha가 reuseMatch에 존재".
- 검증 루프: `npm run check:ts-core` clean → `npx vitest run src/core-runtime/reconstruct/run.test.ts`(현 **93/93** 유지+신규) → 가드 `check:import-boundary`·`check:invariant-drift`·`check:supported-models` green.

## 코드 앵커 (현 HEAD `86debbf` 기준)
- `baseSystem`: `src/core-runtime/reconstruct/run.ts:6544` · 38 `systemPrompt:` 사이트.
- 미러 패턴: `competencyQuestionAssessmentProjectionContractSha256()` run.ts:815 (+ `COMPETENCY_..._CONTRACT_VERSION` import line 208, fold line 824/826).
- reuse-match 인터페이스 필드: run.ts:750 (`semantic_author_model_identity: string;` 바로 아래에 prompt sha 추가).
- builder fold 자리: run.ts:1268 (CG-2의 `semantic_author_model_identity:` 옆).
- `reuseMatchHash`(sha256Text(stableJson(match))) + resume 비교: writeFreshAuthoredYamlDocument(키 다르면 "resume provenance mismatch" throw).
- CG-2 디프(템플릿): `git show 0f04116`.

## 비-목표 / 가드
- ❌ 수동 버전 문자열(forgettable). ❌ 런타임 의미 변경(순수 캐시키 추가). ❌ CG-2/RC-1 재작업(완료/문서화됨). ❌ P1/P2 (CG-1·validator 후).
- 마스킹/redaction 재도입 금지(레포 정책 불변).

## CG-1 후
P0 완결 = CG-2(✅)+CG-1+coverage validator. 그 후 **P1(엔진 MVP sidecar)**: Cut-2 value-tile 실험→배선·ComprehensionArtifact(§5.7)·leaf-reader+triage+reduce·2-tier epoch/llm_touch_fingerprint(Cut-4a reference→실배선·non-circular-key validator)·**sidecar를 실 파이프라인에 먹임=4b-2가 시뮬만 한 E2E**. 그 다음 P2(이연: Cut-2b 안전경로B·Cut-3 vision·dependency-discovery 자동화·교차모델).

## 포인터
- 설계 SSOT: `development-records/design/20260625-rescoped-comprehension-engine-design.md`(§7.6 Cut-4b·§10.8 CG-2/CG-1·§10.9 Cut-4b 게이트).
- 전체 이력 handoff: `development-records/handoff/20260626-cut2-resume.md`.
- 메모리: [[unified-comprehension-engine-track]]·[[explain-decisions-plainly]](owner=plain outcome-framed 설명 선호).
