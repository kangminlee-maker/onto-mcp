# stance `--json-schema` 배선 + actionability 진단 — start-here (2026-07-08)

> 대상: 다음 세션(codex 예정). 이 문서가 두 작업의 SSOT다.
> 작성: Claude 세션 2026-07-08. 이전 맥락은 §7 참조 링크.

---

## 0. 현 상태 (pinned)

- **branch**: `feat/claude-worker-jsonschema-gate-detection` (base `main` `6b06e5b`)
- **HEAD**: `e5387aa` — 이번 세션 **3커밋**: 감지 `091d73b` · gate `4ce4ed7` · worker `e5387aa`. **codex는 이 브랜치에서 이어간다.**
- **워킹트리 선재 미커밋**: `llm-caller.ts`·`model-switcher.ts`(+test)·`settings-chain.ts`(+test)·`claude-oauth-dispatch.test.ts`·`configure-provider.ts`(+test)·`README.md`·`settings.example.json` (다른 세션 INV-MODEL-1/oauth 계열). **이번 작업과 무관 — §1, 건드리지 말 것.**
- **dist 재빌드됨**: `npm run build:ts-core` 완료 — `claude-code-review-unit-executor.ts`의 `--json-schema`가 `dist/`에 반영됨. **claude worker executor는 `dist`에서 실행되므로 executor를 수정하면 반드시 재빌드**(staleness 가드가 `dist ... is older than src`로 막는다). dist는 gitignore라 커밋에 없음 — codex도 clone 후 `npm run build:ts-core` 먼저.

### 검증 환경 전제
- review 벤치는 repo 코드를 `tsx`로 직접 실행하되, **claude worker(executor)만 `dist`에서 subprocess로 실행**된다.
- anthropic worker는 이 환경에서 **작동한다**(이번 세션 감지 개선 덕 — §2.1). oauth(구독) 경로, per-token 비용 없음.
- **claude CLI 인증은 macOS Keychain**에 있고(파일 아님), 감지가 `claude auth status`로 위임돼 인식된다.

---

## 1. 미커밋 변경 구분 (중요)

| 파일 | 소유 | 건드릴지 |
|---|---|---|
| `src/core-runtime/cli/claude-code-review-unit-executor.ts` | **이번 세션** (worker `--json-schema`) | 작업 1에서 참조 |
| `src/core-runtime/discovery/host-detection.ts` (+`host-detection.test.ts`) | **이번 세션** (감지 개선) | 건드리지 말 것 (완료) |
| `src/core-runtime/review/semantic-quality-gate.ts` (+`.test.ts`) | **이번 세션** (gate 정정) | 작업 2에서 참조 |
| `llm-caller.ts`, `model-switcher.ts`(+test), `settings-chain.ts`, `claude-oauth-dispatch.test.ts`, `README.md`, `settings.example.json` | **선재(다른 세션, INV-MODEL-1/oauth 계열)** | **건드리지 말 것** — 이번 작업과 무관 |

> 권장: 이번 세션 3개 파일(+test 2개, +untracked `host-detection.test.ts`)을 **선재와 분리해 먼저 커밋**하면 codex base가 깨끗해진다. 단 선재 미커밋과 파일이 겹치지 않으므로 `git add <이번 파일들>`로 선택 커밋 가능.

---

## 2. 이번 세션 완료 작업 (검증됨 — 재작업 불요)

### 2.1 감지 개선 — `host-detection.ts`
- `detectClaudeBinaryAvailable`을 **`claude auth status` CLI 위임 + 파일 credential fallback**으로 전환. claude CLI가 credential을 macOS Keychain에 저장(파일 없음)해 기존 파일-검사가 false negative였던 것을 해결. 크로스플랫폼(위임이라 OS별 저장소 무관).
- 순수 파서 `parseClaudeAuthLoggedIn(stdout)` 분리. `resolveClaudeBin`(ONTO_CLAUDE_BIN+PATH) 재사용, 5s timeout.
- 검증: typecheck·import-boundary·spec-defaults PASS, 단위 7/7, `review-execution-profile` 12/12, 실증 `detectClaudeBinaryAvailable()===true`.

### 2.2 gate 모델-중립 정정 — `semantic-quality-gate.ts`
- `boundary_uncertainty_preservation`을 **final Boundary Notes projection → finding-ledger authority(non-material findings)** 기반으로. gpt-5.5의 projection 스타일을 필수화한 편향 제거. `false_materiality_guard`와 orthogonal 유지(오판 축 vs 보존 축), negative control 테스트 추가.
- 근거: opus가 lensId decoy를 **finding-ledger에 정확히 보존**하고 final엔 material 이슈 경계를 우선한 것은 품질 저하가 아니라 projection 우선순위 차이. (판단 근거는 §7 메모리로 저장 예정.)
- 검증: opus 산출물 재판정 overall PASS·boundary PASS(LLM 재호출 없이), gate 테스트 28/28, 소비자(effort-calibration ×4) 40/40, typecheck PASS.
- **주의**: 이 정정은 INV-MATERIAL-1("기준을 완화로 해결 금지")과 긴장한다. 완화가 아니라 **보존 authority를 finding-ledger로 정정**한 것이라는 논리를 유지할 것. 작업 2(actionability)도 같은 함정에 유의.

### 2.3 worker `--json-schema` — `claude-code-review-unit-executor.ts` (lens 부분 완료)
- **근본 원인**: claude worker가 `--json-schema` 미사용 → 스키마를 프롬프트에 넣고 opus가 **free-form JSON을 생성 → 큰 findings에서 문법 실수(콤마 누락)** → `output_contract` 실패 → retry 없이(terminal, lens에 resubmit 미배선) 즉시 degrade. 매 실행 랜덤 lens 2개가 무너짐(1차 axiology/logic, 2차 semantics/structure).
- **해결**: `runClaudeWorker`에 `--json-schema` 추가. claude CLI가 grammar-constrained **native `structured_output` object**를 반환 → malformed JSON 원천 불가능. `extractClaudeStructuredPayload`가 structured_output을 이미 우선 파싱(기존 지원). 3 호출부(메인 + salvage workerBase)에 `jsonSchema` 전달. 프롬프트 스키마(`appendSchemaToPrompt`)는 redundant 힌트로 유지.
- **주석 정정**: 기존 "claude `--json-schema`가 복잡 스키마 거부"는 **empirical로 부정확** 확인. opus·haiku 모두 실제 lens 스키마(`additionalProperties:false`+deep required, ~20 params, enum)로 native object 반환. lens 스키마는 `--json-schema` 한계(24 optional param, string/numeric constraint 금지, `$ref`/recursive 금지) **내**(optional 0, constraint 0, ref 0).
- **검증 결과 (opus all-medium, `--json-schema`)**: **lens 6/6 완주, degrade 0**(이전 4/6). session: `onto-review-benchmark-all-medium-HvnSNP/.onto/review/20260708-d8176040`. typecheck PASS, executor 테스트 7/7.
- **잔존 = 작업 1**: 같은 run에서 **stance unit 1개만 `output_contract`**. stance는 nested-batch 경로라 `--json-schema` 미적용(§3).

---

## 3. 작업 1 — stance `--json-schema` 배선

### 3.1 진단 (확정된 것)
- opus all-medium(`--json-schema`) run에서 **lens 6/6 완주, 하지만 `issue-stance:*` 1개가 `output_contract`**.
- 실패 message stdout에 claude CLI **stream events가 raw**로 있고 **`structured_output` 필드가 없다** → **stance는 `--json-schema`를 못 받았다**(적용됐다면 native structured_output이 온다).
- stance outputFormat = `issue-stance-response`(runtime-submit) → `buildWorkerSubmitSchema`가 schema를 반환한다(§`worker-structured-output.ts:226`). 즉 **flat 경로였다면 `--json-schema`가 붙었어야 한다**. 차이는 lens=main-workers(flat) vs **stance=nested-batch**.

### 3.2 미확정 (codex가 추적할 것)
`--json-schema`는 `runClaudeWorker`(executor 내부, `claude-code-review-unit-executor.ts`)에서 붙는다. nested-batch에서 stance가 이 경로를 타는지가 관건:
- `src/core-runtime/cli/nested-batch-dispatch.ts` — `executeReviewViaNestedBatch`(:367). outer worker가 배치를 fan out.
- `src/core-runtime/cli/claude-nesting-batch-worker.ts` — `spawnOuterClaude`(:120)가 outer `claude -p` spawn. inner unit executor argv는 caller가 넘김(`inner_executor:{bin,args}`).
- `src/core-runtime/cli/run-review-prompt-execution.ts` — inner executor config 생성 지점(`executorConfigUsesClaudeWorker`:501 부근, `executorConfigWithUnitSettings`).

**추적 질문**: (a) nested inner가 `claude-code-review-unit-executor` CLI를 실제로 spawn하면 그 내부 `runClaudeWorker`가 `--json-schema`를 자동으로 붙여야 하는데 왜 stance stdout이 raw stream events인가? (b) outer worker가 inner를 spawn하지 않고 **자체 `claude -p`로 stance를 직접 처리**하면 그 경로엔 `--json-schema`가 없다 → 거기 배선해야 한다.
- 힌트: stance stdout의 init event `tools`에 Read/Grep/Glob 외 전체 도구가 나열됐다 — bounded inner executor(--allowedTools 제한)와 다른 실행일 가능성. outer/inner 어느 쪽 claude 호출인지 먼저 확정할 것.

### 3.3 완료 조건 (falsifiable)
- opus all-medium review에서 **stance `output_contract` = 0**, 전 unit 완주(lens 6/6 + stance 전부 completed).
- default-off/byte-보존: `--json-schema` 배선은 claude worker에만 영향(codex/gpt-5.5 무관). sonnet(claude worker)에도 적용돼야 하며 회귀 없어야.
- 검증 커맨드(§5). **N=1 probe로 먼저 확인 후** 필요시 decision-grade.

### 3.4 주의
- **retry 없음**: `output_contract`는 terminal이고 lens/stance에 resubmit 미배선. `--json-schema`가 근본책이라 retry 배선은 불요.
- stance 스키마도 `--json-schema` 한계 내인지 확인할 것(lens는 확인됨; stance=issue-stance-response 스키마는 미확인 — `createRuntimeSubmitTools` 생성 후 optional param/constraint 카운트, §5 방법 참조).

---

## 4. 작업 2 — actionability fail 진단

### 4.1 증상
`--json-schema` 적용 후에도 opus·sonnet **공통으로 `actionability` 1개만 semantic fail**:
- opus: `material_action_candidates=accept_risk,follow_up`
- sonnet: `material_action_candidates=fix_before_release,accept_risk,follow_up`
- 두 경우 evidence: `expected final output to include a concrete remediation path`
- **단서**: sonnet은 `fix_before_release`(구체 교정)를 포함하는데도 fail → check가 특정 action-candidate 값이나 remediation 텍스트 표현을 기대하는 **gpt-5.5 스타일 편향**일 가능성. (2.2 boundary 정정과 동형 의심.)

### 4.2 진단 방법
1. `actionability` check 로직 확인: `src/core-runtime/review/semantic-quality-gate.ts`에서 `actionability` check 정의. 무엇을 pass 조건으로 보는지(action-candidate 집합? `actionMaterialTerms`/`actionRemediationTerms` substring 매칭? material 이슈에 concrete action 유무?).
2. fixture 기대: `FIXTURES["review-pipeline-target-v1"].actionMaterialTerms`/`actionRemediationTerms`(현재 `["return type","fallback","widen","guard","focused test","verify"]` 류). opus/sonnet 산출물의 final output·issue-ledger에서 remediation 텍스트를 대조.
3. **판정**: (a) 실제 약점(리뷰가 concrete remediation을 안 냄)인가, (b) gate 편향(다른 표현/우선순위를 fail)인가.
   - (b)면 boundary 정정과 동일 원칙으로 **authority(issue-ledger의 action_candidates/remediation) 기반**으로 모델-중립 정정. **INV-MATERIAL-1 유의**: 완화가 아니라 authority 정정이어야 하며, opus를 통과시키려 기준을 낮추는 안티패턴 금지. owner(사용자) 판정이 필요한 품질 정의일 수 있으니, 편향 근거를 제시하고 확인받을 것.
   - (a)면 gate 유지, opus/sonnet의 실제 약점으로 기록.

### 4.3 완료 조건
- actionability fail의 성격을 (a)/(b)로 **근거와 함께** 판정. (b)면 정정 후 opus·sonnet 재판정 PASS + 기존 gate 테스트 회귀 + negative control. (a)면 문서화.

---

## 5. 재검증 명령 / gotchas

### probe 커맨드 (opus, stance 검증용)
```bash
npm run benchmark:review:pipeline -- \
  --model claude-opus-4-8 --provider anthropic --auth oauth \
  --case all-medium --runs 1 --fixture review-pipeline-target-v1 \
  --output <out>.json --keep-tmp --timeout-ms 900000 --unit-timeout-ms 900000 \
  --max-concurrent-lenses 3
```
결과 확인: `jq '.runs[0] | {participating_lens_count, degraded_lens_count, failure_kind_counts, semantic:.semantic_quality_gate.status}'`. stance 실패는 `.semantic_quality_gate` 밖 `failure_kind_counts.output_contract` + session `execution-result.yaml`의 `issue-stance:*` status로 확인.

### gotchas
- **executor 수정 시 `npm run build:ts-core` 필수** (dist 실행 + staleness 가드).
- **claude worker 병렬 probe 금지**: 두 review를 동시에 돌리면 claude worker(anthropic oauth)가 부하로 lens degrade(재현됨). **순차 실행**.
- opus review ≈ 7–10분/run. sonnet **medium이 sweet spot**(6/6 완주 ~8.8분); sonnet **high/xhigh는 20분 timeout**(thinking-on review 비실용). opus **low는 붕괴**(품질 하한=medium).
- 벤치는 정정된 gate를 쓴다(repo 코드 tsx 실행) — semantic 판정은 이미 §2.2 정정 반영.
- 스키마 `--json-schema` 한계 카운트 방법: 코드에서 tool 생성 후 `input_schema`를 재귀 순회해 optional-param/`minLength|maxLength|minimum|maximum|pattern|format`/`$ref`/union 카운트 (lens는 optional 0·constraint 0으로 통과).

---

## 6. 측정 현황 요약 (참고 — §4-6c 모델 확장 맥락)

| 조합 | 결과 |
|---|---|
| opus medium (`--json-schema`) | lens 6/6, stance 1 output_contract(작업1), actionability fail(작업2) |
| opus low | 붕괴 (품질 하한 = medium) |
| sonnet medium | 6/6 완주, actionability fail |
| sonnet high/xhigh | 20분 timeout (비실용) |
| gpt-5.5 (현 프로덕션, codex worker) | 유닛별 medium/low decision-grade 배포됨 — claude worker 이슈 무관 |

작업 1·2가 끝나면 opus/sonnet medium을 **decision-grade(3×2)**로 올려 §4-6c 모델 티어링 판단으로 복귀.

---

## 7. 참조
- 배경(§4-6c·모델 레지스트리·effort 검증): 메모리 `onto-mcp-s4-backlog-validity-20260706`, 작업 순서표 `development-records/plans/20260706-s4-backlog-work-order-and-d1-authority.md`.
- gate/감지/worker 판단 근거: (이 세션에서 저장 예정 메모리 — 감지 Keychain 위임, boundary authority 정정, claude worker free-form JSON 문법 원인).
- 검증 산출물: scratchpad `effort-probe/probe-*.json`(세션 tmp — 영속 필요시 `development-records/benchmark/`로 이동). opus 6/6 session: `…/onto-review-benchmark-all-medium-HvnSNP/.onto/review/20260708-d8176040`.
- 핵심 코드: `claude-code-review-unit-executor.ts`(runClaudeWorker/--json-schema), `nested-batch-dispatch.ts`·`claude-nesting-batch-worker.ts`(stance 경로), `semantic-quality-gate.ts`(actionability), `worker-structured-output.ts`(buildWorkerSubmitSchema).
- INV: INV-CFG-1(effort는 settings.json 권위), INV-MATERIAL-1(기준 완화 금지), INV-BENCH-1(decision-grade 3×2), INV-MOCK-1(live semantic path).
