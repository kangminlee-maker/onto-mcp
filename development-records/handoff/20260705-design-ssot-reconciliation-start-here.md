# 설계 SSOT 본문 조정 start-here (2026-07-05)

한 줄 상태: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md`의
§8 정정([정정 2026-07-05]·[구현 발견 2026-07-05])이 본문 §3/§6/§7에 in-place 반영되지 않아 SSOT가
자기모순 상태다 — 교차 리뷰 VERDICT: FAIL. 이 세션의 과업은 본문을 §8 기준으로 조정하는 문서 작업이며,
코드 변경은 없다.

## Pinned state

- repo: `~/Documents/onto-mcp` · branch `main` · HEAD `ca604d0` (working tree clean, 2026-07-05 23시 기준)
- 참고: 설계 B 브레이커는 PR #168로 구현, PR #170으로 관찰 모드 ON — 즉 문서의 미래형 서술 일부는 이미
  현재형이 됐다. 조정 시 §4도 그 관점에서 시제를 점검할 것.
- 리뷰 출처: ultracode-for-codex v0.4.1 `task` run (job_232bb7a9, 2026-07-05 22:35–22:59 KST, 14 agents,
  cwd=이 repo). findings 전문은 아래 부록에 원문 그대로 동봉 — 이 문서만으로 재검증 가능.
- 이번 세션 authoring tier: 문서 조정 = WORKHORSE. 리뷰어(GPT family) findings는 아래에서 CONFIRMED로
  재검증됨(Claude 세션이 HEAD 문서와 대조).

## CONFIRMED (HEAD ca604d0 문서에서 잔존 확인, 부록 findings와 대조 완료)

1. §3(문서 57행)이 stance 화이트리스트를 `allowed_evidence_refs`로 서술 — §8 정정(139-141행)은 per-issue
   `issue_evidence_refs`가 맞고 `allowed_evidence_refs`는 deliberation 필드라고 확정. 본문 미수정.
2. §3(62-64행)·§6(115행)이 신규 retry cap/settings 키 2개를 서술 — §8 정정(142-147행)은 blind retry가
   이미 존재하며 기존 `issue_artifact_max_retries` 재사용 + 신규 키는 `resubmit.enabled` 1개로 축소.
   본문 미수정.
3. §6(110행)이 리뷰 재시도 어휘를 `attempt_id/attempt_kind`로 표기 — §8 정정: 리뷰 측은
   `attempt_count`+`recovery`, `attempt_id/attempt_kind`는 reconstruct 전용. 본문 미수정.
4. §3(65-67, 70-72행)의 강등 서술이 §8 구현 발견(148-153행)의 terminal resolution 마커
   (`resolution: "demoted"` + `isResolvedLedgerUnit`, stance matrix `validation.missing_stances` 소비)를
   반영하지 않음 — durable 강등 표면이 본문에 부재.

부수(리뷰 verdict에 포함): §7 완료조건이 정정된 표면(오류 명세 주입·유닛 강등·ledger resolution)을
게이트하지 못한다는 판정 — F-A 픽스처 서술을 정정 표면에 맞춰 점검할 것.

## PROPOSED (다음 세션의 작업 — owner 확인 후 진행)

- §3을 §8 기준으로 in-place 재서술: 필드명 교정, "이미 존재하는 blind retry에 오류 명세를 주입"으로
  신규 표면 재정의, durable 강등(ledger resolution 마커) 반영.
- §6 표 갱신: 어휘 행 교정(`attempt_count`+`recovery`), 신설 키 2개→1개(`resubmit.enabled`), ledger
  resolution 마커 행 추가 여부 판단.
- §7 F-A1~A3을 정정 표면 기준으로 재점검(시도 횟수 서술 제거, 강등·공시·resolution assert 반영).
- 조정 원칙: §8의 정정 기록은 이력으로 보존하되, 본문이 현재 진실을 말하게 한다 (Documentation Hygiene).
  각 조정 지점에 §8 참조를 남길지는 owner 판단.
- 완료 후 검증: 동일 프롬프트의 교차 리뷰 1회 재실행(부록 하단 재실행 커맨드) → VERDICT PASS 확인.

## 다음 세션 첫 커맨드 (Kickoff contract: 모델 명시)

```
cd ~/Documents/onto-mcp && claude --model opus
# 첫 프롬프트: "development-records/handoff/20260705-design-ssot-reconciliation-start-here.md 읽고
# CONFIRMED 4건대로 설계 SSOT 본문(§3/§6/§7)을 §8 기준으로 in-place 조정. 코드 변경 없음."
```

리뷰 재실행(조정 후 검증용):

```
ultracode-for-codex run --accept-llm-guide=v1 --cwd /Users/kangmin/Documents/onto-mcp --name task \
  --args '{"prompt":"Verify that the main body of development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md is now consistent with its section-8 corrections. Output VERDICT PASS/FAIL + findings."}'
```

---

## 부록 — 교차 리뷰 findings 원문 (v0.4.1 task run, 2026-07-05, 무수정 전재)

VERDICT: FAIL — §8 corrections are broadly consistent with the current repo/test/contract surface, but the design SSOT is not reconciled. Main-body §§3/6/7 still contain stale or underspecified statements invalidated by §8, and §7 is not a safe completion gate for the corrected Design A/B surface.

## Severity-ranked findings

| Sev | Finding | Invalidated main-body statement | Corrected evidence / anchors | Required decision / action |
|---|---|---|---|---|
| HIGH | §3 names the wrong stance whitelist surface. The main body says `submit_issue_stance_response` validates against `allowed_evidence_refs`; §8 and code show issue stance uses per-issue `issue_evidence_refs`, while `allowed_evidence_refs` is deliberation-only. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:56-57` / §3 | §8 correction: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:138-141`; code: `src/core-runtime/cli/structured-output-tools.ts:46-52` | Update §3 in place: replace stance `allowed_evidence_refs` with `issue_evidence_refs`; explicitly reserve `allowed_evidence_refs` for deliberation. |
| HIGH | §§3/6 still imply Design A adds a new retry cap/settings key. §8 corrects this: blind retry already existed; Design A reuses `issue_artifact_max_retries: 2` = 3 total attempts. The new A surface is `resubmit.enabled`, error-spec injection, demotion, and correlated escalation. | §3 retry/cap wording: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:61-63`; §6 “키 2개 / cap=3”: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:114` | §8 correction: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:142-146`; settings: `src/core-runtime/discovery/settings-chain.ts:234-246`; test fixture: `src/core-api/runtime-pipeline-resubmit.test.ts:196-206`, `src/core-api/runtime-pipeline-resubmit.test.ts:337-341` | Rewrite §3/§6 to say A reuses existing `issue_artifact_max_retries`; do not introduce a second resubmit cap authority. |
| HIGH | §6 uses stale review retry vocabulary. It says review retry records `attempt_id/attempt_kind`; corrected/current review artifacts use `attempt_count` plus optional `recovery`. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:109` / §6 | §8 correction: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:140-142`; artifact types: `src/core-runtime/review/artifact-types.ts:350-430`; F-A1 assertion: `src/core-api/runtime-pipeline-resubmit.test.ts:337-341` | Replace §6 row with review vocabulary: `attempt_count` and optional `recovery`; reserve `attempt_id/attempt_kind` for reconstruct/shared-ledger telemetry. |
| HIGH | §3 under-specifies durable demotion. It describes cap exhaustion as degradation-summary + matrix disclosure, but §8 discovered continuation/frontier also requires terminal ledger `resolution: "demoted"` sourced from `issue-stance-matrix.yaml.validation.missing_stances`. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:64-66`, `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:70-72` / §3 | §8 correction: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:147-152`, `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:216-219`; ledger contract: `.onto/processes/shared/pipeline-execution-ledger-contract.md §3`; code: `src/core-runtime/pipeline-execution-ledger.ts:80-90`, `src/core-runtime/pipeline-execution-ledger.ts:141-154`, `src/core-runtime/review/pipeline-execution-ledger.ts:330-430`; test: `src/core-api/runtime-pipeline-resubmit.test.ts:364-375` | Add `validation.missing_stances` + `PipelineExecutionLedgerUnitEntry.resolution: "demoted"` to §3 as core runtime authority, not just implementation note. |
| HIGH | §7 F-A1 is incomplete for corrected Design A. It requires degradation-summary and synthesis disclosure, but omits required assertions for `issue_evidence_refs`, error-spec packet injection, existing-budget `attempt_count=3`, matrix `missing_stances`, and ledger demotion. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:119-121` / §7 F-A1 | §8 corrections: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:138-152`, `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:216-219`; test evidence: `src/core-api/runtime-pipeline-resubmit.test.ts:323-376` | Rewrite F-A1 to assert the corrected contract: per-issue whitelist, packet error spec, `attempt_count=3`, degradation failed unit, matrix `validation.missing_stances`, terminal demotion, and no whole-run halt. |
| HIGH | §7 Design B criteria are too generic/stale after §8. They omit corrected surfaces: `review.execution.retry.dispatch_breaker`, `per_call_max_attempts`, capped exponential backoff, status/marker classification, skip semantics, post-trip in-flight handling, retry spend/census, exact `dispatch-incomplete.yaml`, review lens/stance wiring, OFF twins, and clean ON observability. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:125-129` / §7 F-B1–F-B3 | §8 corrections: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:158-195`, `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:201-215`; contract: `.onto/processes/review/prompt-execution-runner-contract.md:111-133`; policy: `src/core-runtime/llm/dispatch-breaker.ts:1-31`, `src/core-runtime/llm/dispatch-breaker.ts:183-193`, `src/core-runtime/llm/dispatch-breaker.ts:253-290`, `src/core-runtime/llm/dispatch-breaker.ts:332-443`; settings: `src/core-runtime/discovery/settings-chain.ts:118-145`, `src/core-runtime/discovery/settings-chain.ts:206-213`; review tests: `src/core-api/runtime-pipeline-dispatch-breaker.test.ts:175-349` | Rewrite B criteria as split reconstruct/review gates with exact artifact shape, review `pipeline`/`batch_label`, `halt_phase=lens_dispatch_breaker`, OFF twins, poison, and clean ON cases. |
| HIGH | §7 common ON/default-promotion language is stale. §8/handoff say pre-fix resubmit ON observations are invalid because `definedReviewRetry` failed to copy `resubmit`; live Claude/Codex rate-limit wording also remains unverified. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:130-131` / §7 common | §8 correction: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:196-200`; handoff: `development-records/handoff/20260705-review-breaker-wiring-handoff.md:11-15`, `development-records/handoff/20260705-review-breaker-wiring-handoff.md:82-90`; settings regression: `src/core-runtime/discovery/settings-chain.test.ts` section “keeps a project-file resubmit opt-in through normalize+merge” | Count only post-fix live observations toward ON/default promotion; require live provider rate-limit/session-limit phrase verification before breaker promotion. |
| MEDIUM | §7 F-A3 omits demoted/resolved ledger behavior and names a historical replay that was not proven. Current evidence is a synthetic halted-session continuation fixture, not literal archived `20260701-7d89385c` replay. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:123-124` / §7 F-A3 | Synthetic continuation test: `src/core-api/runtime-pipeline-resubmit.test.ts:482-527`; demotion/frontier code: `src/core-runtime/pipeline-execution-ledger.ts:141-154`, `src/core-runtime/review/pipeline-execution-ledger.ts:330-430` | Either attach and test the named historical artifact, or reword F-A3 as synthetic durable-state replay plus explicit “demoted units do not re-enter frontier.” |
| MEDIUM | §7 F-B2 poison semantics are overbroad. “Poison item dead-lettered and batch completes” fits reconstruct/item-local poison, but review stance poison can record dead-letter/no incomplete while still ending `halted_partial` under existing issue-artifact promotion semantics. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:128` / §7 F-B2 | §8 review wiring corrections: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:183-195`, `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:201-205`; policy: `src/core-runtime/llm/dispatch-breaker.ts:262-290`; review poison fixture: `src/core-api/runtime-pipeline-dispatch-breaker.test.ts:403-449`; reconstruct semantic-map F-B2: `src/core-runtime/reconstruct/semantic-map-stage.test.ts` section “F-B2” | Split F-B2: reconstruct poison completes; review poison preserves current review halt/degradation semantics while breaker dead-letter observability is correct. |
| MEDIUM | §7 F-B3 can be read as automatic recovery, but §8 narrows current scope to persisted recovery contract. Automatic stage-level resume consumption is deferred. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:129` / §7 F-B3 | §8 residual task: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:210-213`; code comments/schema: `src/core-runtime/llm/dispatch-breaker.ts:24-27`, `src/core-runtime/llm/dispatch-breaker.ts:383-407`; handoff: `development-records/handoff/20260705-review-breaker-wiring-handoff.md:96-100` | Reword F-B3 as: `dispatch-incomplete.yaml.incomplete_item_ids` is the exact redispatch set; automatic consumption is follow-up. |
| MEDIUM | Review breaker coverage excludes nested-workers first-attempt fan-out. §8 notes this, but §7 does not carve it out. | §7 B scope: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:125-129`; §8 caveat: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:187-195`; module header: `src/core-runtime/llm/dispatch-breaker.ts:1-31` | Current review breaker evidence covers flat lens/stance pools, not nested-workers first-attempt fan-out. | Add explicit non-goal/follow-up or fixture before claiming full review-dispatch breaker coverage. |
| MEDIUM | F-A1’s “synthesis 결손 공시” is not fully proven by accessible evidence. Tests prove degradation-summary and stance-matrix disclosure; no direct assertion was found for final `synthesis.md` / user-facing output disclosure. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:119-121` / §7 F-A1 | Test evidence: `src/core-api/runtime-pipeline-resubmit.test.ts:352-361`; contract output area: `.onto/processes/review/prompt-execution-runner-contract.md:105-113` | Add a stable final-output/synthesis assertion, or narrow F-A1 wording to matrix + degradation-summary disclosure only. |
| LOW | §8 follow-up items should not be mistaken for completed acceptance criteria: live provider phrase verification, matrix read fail-loud hardening, historical lost `node_ref` rejudgment, and automatic `dispatch-incomplete.yaml` resume consumption remain residual tasks. | `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:153-157`, `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:210-219`; handoff: `development-records/handoff/20260705-review-breaker-wiring-handoff.md:86-103` | These are intentionally deferred or operational tasks. | Keep them listed as non-completion follow-ups; do not use them as evidence of completed §7 criteria. |

## Named-anchor implementability check

| Requested anchor | Verification status | Evidence |
|---|---|---|
| `issue_evidence_refs` | Confirmed as the current issue-stance validation surface. | `src/core-runtime/cli/structured-output-tools.ts:46-52`; §8 correction `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:138-141` |
| `allowed_evidence_refs` | Confirmed present but deliberation-only, not stance. | `src/core-runtime/cli/structured-output-tools.ts:46-52`; stale §3 claim `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md:56-57` |
| `issue-stance:` unit IDs | Confirmed as durable per-lens stance unit shape. | `src/core-runtime/review/pipeline-execution-ledger.ts:144-172`; tests use `issue-stance:<lens>` in `src/core-api/runtime-pipeline-resubmit.test.ts` and `src/core-api/runtime-pipeline-dispatch-breaker.test.ts` |
| degradation-summary writer | Behavior confirmed by E2E tests, but direct writer source not line-anchored because runner file exceeded read limit. | `src/core-api/runtime-pipeline-resubmit.test.ts:352-361`; direct source gap: `src/core-runtime/cli/run-review-prompt-execution.ts` |
| `attempt_count` / `recovery` | Confirmed review vocabulary. | `src/core-runtime/review/artifact-types.ts:350-430`; `src/core-api/runtime-pipeline-resubmit.test.ts:337-341` |
| `issue_artifact_max_retries` | Confirmed as Design A retry-budget authority. | `src/core-runtime/discovery/settings-chain.ts:234-246`; `src/core-api/runtime-pipeline-resubmit.test.ts:196-206`, `src/core-api/runtime-pipeline-resubmit.test.ts:337-341` |
| `review.execution.retry.dispatch_breaker` | Confirmed current review breaker setting/contract surface. | `src/core-runtime/discovery/settings-chain.ts:118-145`; `.onto/processes/review/prompt-execution-runner-contract.md:127-133`; `src/core-api/runtime-pipeline-dispatch-breaker.test.ts:175-205` |
| `per_call_max_attempts` | Confirmed corrected breaker vocabulary. | `src/core-runtime/llm/dispatch-breaker.ts:183-193`; `src/core-runtime/discovery/settings-chain.ts:206-213` |
| `dispatch-incomplete.yaml` | Confirmed artifact path/schema/review contract. | `.onto/processes/review/prompt-execution-runner-contract.md:111-133`; `src/core-runtime/llm/dispatch-breaker.ts:383-407`; `src/core-api/runtime-pipeline-dispatch-breaker.test.ts:257-305` |
| `lens_dispatch_breaker` | Confirmed review lens halt phase. | `.onto/processes/review/prompt-execution-runner-contract.md:127-131`; `src/core-api/runtime-pipeline-dispatch-breaker.test.ts:307-349` |
| `correlated_validation` | Confirmed Design A majority-escalation token. | `src/core-runtime/cli/stance-resubmit.ts:31-33`; `src/core-api/runtime-pipeline-resubmit.test.ts:461-480` |

## Decisions made

- Treat §8 as the corrected post-implementation authority.
- Do not mark §8 internally inconsistent; the defect is failure to update §§3/6/7 in place.
- Mark the SSOT as failed until all stale main-body statements are reconciled.
- Accept that corrected Design A/B are broadly implementable against current repo evidence, but only with caveats around direct runner-source access and live-provider observations.
- Judge §7 as insufficient: it must be rewritten before it can serve as a falsifiable completion gate.

## Verification status

- Design A corrected surface: mostly verified through helpers, artifact types, settings, and E2E-style tests.
- Design B corrected surface: mostly verified through shared breaker policy, settings schema, review contract, reconstruct semantic-map tests, and review lens/stance tests.
- Default-off behavior: verified in settings/tests for both resubmit and dispatch breaker.
- OFF-twin behavior: verified by resubmit and dispatch-breaker test coverage.
- Direct runner internals: not fully verified due workspace read limits.

## Residual risk / evidence gaps

- Direct source anchors were unavailable for `src/core-runtime/cli/run-review-prompt-execution.ts` because the file exceeds the workspace read limit.
- Direct source anchors were unavailable for `src/core-runtime/reconstruct/run.ts` because the file exceeds the workspace read limit.
- No live-provider evidence confirms actual Claude/Codex 429/session-limit wording matches current rate-limit patterns.
- No archived `20260701-7d89385c` artifact was available to verify literal F-A3.
- No direct final-output/synthesis assertion was found proving user-facing disclosure of demoted/missing stance.
- Nested-workers first-attempt fan-out remains outside current review breaker coverage unless explicitly carved out or implemented later.
