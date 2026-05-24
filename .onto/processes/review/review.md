# Review Reference Execution

> The 9 review lenses plus a separate synthesize stage review a target from multiple perspectives.
> Related: If learnings accumulate after review, promotion is possible via `.onto/processes/learn/promote.md`.

This document is the prompt-backed reference execution for `검토 (review)`.
The canonical live execution authority is `.onto/processes/review/productized-live-path.md`.

## Canonical bounded path

The live path should be understood first as the following 3 bounded stages:

Preferred repo-local combined entrypoint:

- `npm run review:invoke -- ...`

Internal bounded path:

1. `npm run review:start-session -- ...`
2. `npm run review:run-prompt-execution -- ...`
3. `npm run review:complete-session -- ...`

The remaining sections explain how the prompt-backed reference execution should behave so that
it matches the productized live path and produces the same artifact truth.

**Reference execution composition**:
- **Main context coordinator**: temporary prompt-path coordinator only
- **Review lenses**: 9 independent review lenses
- **Synthesize stage**: `synthesize`

**Productization mapping note**:
- The canonical live execution truth is defined in `.onto/processes/review/productized-live-path.md`.
- Step 0 and Step 1.5 are primary source material for `검토 해석 (InvocationInterpretation)`.
- Step 1 and the deterministic parts of Step 2 are primary source material for `검토 고정 (InvocationBinding)`.
- The independent review work of Step 2 maps to per-lens execution.
- Step 3 maps to the synthesize stage.
- In the prompt-backed reference path, each review lens is executed as a `ContextIsolatedReasoningUnit` so that lens-specific context remains isolated.
- In a productized prompt path, Step 0 and Step 1.5 are executed as pre-process interpretation work and should not be semantically re-done a second time inside the live review pass.
- In a productized prompt path, `round1/*.md`, `deliberation.md`, and `synthesis.md` are human-readable source layers, while the primary artifact is `review-record.yaml` per `.onto/processes/review/record-contract.md`.

**Important boundary**:
- Step 0, Step 1, and Step 1.5 below are not the canonical live execution order.
- They remain here as source material and reference logic for the prompt-backed path.
- The actual live path begins after the invocation artifacts and execution preparation artifacts already exist.

**Productized prompt path**:
- `review:invoke`
- internal bounded path: `review:start-session` → `review:run-prompt-execution` → `review:complete-session`
- `review:run-prompt-execution` owns lens execution, controlled lens deliberation, and synthesize execution

---

### 0. Domain Selection

Reference source material for `검토 해석 (InvocationInterpretation)`.
Productized live path에서는 이 내용을 직접 다시 실행하지 않고,
이미 해석 단계에서 결정된 결과를 사용한다.

Determine `{session_domain}` per the "Domain Determination Rules" in `process.md`.

Domain selection inputs:
- `--domain {name}` → non-interactive resolution; `--no-domain` → empty `{session_domain}` (no-domain mode)
- Otherwise (no domain flag): run the Domain Selection Flow (target analysis → collect available domains → derive suggestion → display UI → await user input)
- `--domain` and `--no-domain` are mutually exclusive (specifying both fails fast at parser layer)
- **Seed review detection**: If the review target path matches `drafts/{domain}`:
  - Default domain recommendation: no-domain mode (`--no-domain`) unless user explicitly specifies otherwise
  - Reason: seed content is unverified, so applying domain-specific rules would use unverified content as standards

The resolved `{session_domain}` is used throughout this session for domain document loading, learning storage tags, and the verification context section of the final output.

---

### 1. Context Gathering (performed by team lead)

Reference source material for `검토 해석 (InvocationInterpretation)` + `검토 고정 (InvocationBinding)`.
Productized live path에서는 이 내용이 `binding`과 `execution preparation artifact`로 재배치된다.

The team lead collects only the items below. Per-agent learnings/domain documents are self-loaded by the teammate.

1. **Review target collection**:
   - If file/directory: reads the relevant code.
   - If design/decision: reads the related documents.
   - If `drafts/{domain}` path: reads all 8 files from `~/.onto/drafts/{domain}/` as the review target (seed review mode). The seed domain's documents are the review target, not verification standards. Verification standards come from: (a) agent intrinsic methodology, (b) `--domain {other-name}` if specified, (c) LLM pre-training knowledge.

2. **Project context collection**:
   - Identifies the system purpose and principles from CLAUDE.md, README.md, etc.

3. **Domain + path resolution**:
   - Uses `{session_domain}` determined in Step 0.
   - Identifies the plugin path. (Used for path variables in teammate initial prompt)

4. **Agent definition collection** (for all agents individually):
   - `.onto/roles/{agent-id}.md` — role definition source material. The prompt-backed path reads the current repo copy and packages the needed content into deterministic prompt packets.

---

### 1.5 Complexity Assessment (performed by team lead)

Reference source material for `검토 해석 (InvocationInterpretation)`.
Productized live path에서는 이 semantic 판단이 live review pass 바깥에서 한 번만 수행된다.

Step 1에서 수집한 리뷰 대상과 주체자(Principal)의 요청 형태에 따라, 경량 리뷰 제안 절차는 두 경로로 분기한다.

**경로 1 — Principal 이 경량 리뷰를 명시 요청한 경우:**
사전 trigger (Q2/Q3) 는 건너뛴다. 곧바로 semantic lens relevance 판정을 수행한다.

- 판정 규칙: `.onto/processes/review/shared-phenomenon-contract.md §7 Reverse Application` 을 따른다
- 출력: `interpretation-contract.md §4.7 lens_selection_plan` shape
- `axiology` 는 `always_include` 로 고정 (목적·가치 정합 검증은 모든 리뷰 필수). 이유는 `interpretation-contract.md §4.7` 소유
- 결과를 주체자에게 제시하고 확인 후 경량 리뷰 실행

**경로 2 — Principal 이 경량을 명시 요청하지 않은 경우 (default):**
먼저 cheap trigger 로 "경량 리뷰 제안할 가치가 있는가" 를 판정한다. trigger 는 target 본문을 읽지 않는 metadata/intent 수준의 heuristic 이며, 최종 lens 선택 판단이 아니라 **주체자에게 질문할지** 만 결정한다.

**Q2 (trigger): 에이전트 간 교차 검증이 부차적인가?**
교차 검증이 핵심인 경우: 시스템 전체 설계 변경, 다중 파일 수정, 새 개념 도입
교차 검증이 부차적인 경우: 단일 관점 판단, 기존 설계 내 수정, 문서 정확성 확인
→ 부차적: 경량 제안 trigger 성립

**Q3 (trigger): 놓칠 수 있는 발견의 위험도가 수용 가능한가?**
위험도 높음: 구현 직전 최종 검증, 안전장치 설계, 기존 주체자 영향 변경
위험도 낮음: 탐색적 질문, 초기 방향, 내부 문서, 이미 리뷰 거친 후속 확인
→ 수용 가능: 경량 제안 trigger 성립

- Q2 · Q3 모두 trigger 성립: 주체자에게 경량/전원 선택지 제시 (아래 포맷). 주체자가 경량을 선택하면 경로 1 의 semantic 판정을 수행한 뒤 실행
- 하나라도 trigger 불성립: 9 lens 전원 직행. 주체자에게 질문하지 않고 간단 사유만 기록

> Trigger 는 "물어볼 가치가 있는가" 의 binary 결정에만 쓰인다. 실제 lens 선택 판단은 `shared-phenomenon-contract.md §7` 이 단독 소유한다. Q1 (관련 차원 수 counting) 은 §7 의 semantic 판정 결과로 자연스럽게 재현되므로 본 절에서 삭제됨.

**경량 제안 시 주체자에게 제시하는 포맷 (trigger 통과 직후, §7 판정 수행 전):**

이 포맷은 경량/전원 binary 선택만 요청한다. 권장 lens 구성은 포함하지 않는다. Principal 이 "전원" 선택 시 §7 semantic 판정(b)이 수행되지 않으므로 불필요한 비용을 피한다.

```
## Review Mode Suggestion

**대상**: {리뷰 대상 요약}
**경량 리뷰 제안 사유**:
- Q2: {교차 검증이 부차적인 근거}
- Q3: {놓칠 위험이 수용 가능한 근거}

[a] 경량 리뷰 — 본 리뷰에 관련된 lens 만 선별 (axiology 포함)
[b] 전원 리뷰 (9개 lens + synthesize, ~550k 토큰)

Select [a]:
```

**전원 필요 판단 시 (Q2/Q3 trigger 불성립):**
별도 안내 없이 기존 프로세스대로 9개 lens + synthesize로 진행한다.
리뷰 시작 시 "9개 lens 전원 + synthesize로 진행합니다"를 표시.

**경량 선택 확정 후 — Lens Selection Plan 제시 포맷:**

경로 1 (Principal 경량 명시) 또는 경로 2 에서 주체자가 `[a] 경량 리뷰` 를 선택한 직후 수행한다.

1. `shared-phenomenon-contract.md §7 Reverse Application` 에 따라 target 본문 sampling → phenomenon 추출 → 각 lens perspective 와의 co-location 판정 → relevant lens set 도출
2. `interpretation-contract.md §4.7 lens_selection_plan` shape 로 정리 (`always_include: [axiology]` 고정)
3. 주체자에게 최종 구성을 제시하고 확정을 요청한다

```
## Lens Selection

**대상**: {리뷰 대상 요약}
**관련성 판정**: shared-phenomenon-contract §7 reverse application 도출

**권장 구성** ({N}명):
  [a] {agent-id} — {이 대상의 어떤 phenomenon 과 co-locate 되는지}
  [b] {agent-id} — {근거}
  [c] {agent-id} — {근거}
  [d] axiology — 목적 및 가치 정합 검증 (always_include, §7.3 Axiology 제외 불가)

**전원 리뷰와의 차이**:
  제외되는 관점: {제외 에이전트 목록}
  놓칠 수 있는 것: {구체적 설명}

진행? [Y/n]:
```

**에이전트 선택 규칙:**

1. **axiology**: 항상 포함. 이 원칙의 normative seat 는 `shared-phenomenon-contract.md §7.3` 이며 output schema 표현은 `interpretation-contract.md §4.7`.
2. **나머지 lens**: `shared-phenomenon-contract.md §7.1 Reverse 적용 규칙` 으로 도출. 팀 리드의 free-text 선택 아님.

참고 테이블 (팀 리드 판단 보조, target 성격별 경험적 출발점 — §7 판정의 대체는 아님):
| 대상 성격 | 자주 관련되는 lens |
|-----------|------------------|
| 설계 결정/프로세스 | logic + pragmatics + evolution |
| 용어/명명/정의 | semantics + logic + pragmatics |
| 구조/파일 분리 | structure + dependency + conciseness |
| 도메인 커버리지 | coverage + semantics + pragmatics |
| 코드/구현 | logic + structure + evolution |

이 표는 §7 판정의 근거가 아니다. 각 리뷰 실제 lens set 은 §7.1 의 target 본문 sampling 기반 판정을 따른다. v0.2.1 empirical 분석 (`development-records/benchmark/20260419-lens-contribution-analysis.md`) 는 target 성격과 무관하게 broad lens (logic / evolution / axiology) 와 niche lens (structure / semantics / coverage) 의 혼합이 cost-constrained Pareto-optimal 임을 보였다. 본 표의 3-lens 제시는 "핵심 관련성" 의 직관 안내이며, 실제 core-axis 실행은 `.onto/authority/core-lens-registry.yaml` 의 6-lens 구성에 따른다.

---

### 2. Reference Execution — Round 1 Lens Review

This section starts after `review:start-session` has already written:

- `interpretation.yaml`
- `binding.yaml`
- `session-metadata.yaml`
- `execution-plan.yaml`
- `execution-preparation/*`

Before any lens or synthesize unit is actually invoked, the prompt-backed path should prefer:

```bash
npm run review:start-session -- \
  --project-root {project} \
  --session-id "{session id}" \
  ...
```

This writes invocation artifacts, execution preparation artifacts, and deterministic prompt handoff packets under `{session path}/prompt-packets/`.
These packets should stay lightweight and point to authoritative artifact files rather than duplicating large embedded payloads.

The actual prompt dispatch step should then prefer:

```bash
npm run review:run-prompt-execution -- \
  --project-root {project} \
  --session-root "{session path}" \
  --executor-bin {executor bin} \
  --executor-arg={executor arg}
```

canonical requirement:

- lens dispatch는 병렬 실행이 기본이다
- runtime은 선택된 lens 전체를 dispatch한다
- host adapter가 선택된 lens 전체 dispatch를 보장할 수 없으면 fail-loud하게 중단한다

Everything below is reference execution behavior for the prompt-backed path.
Host-specific realization details are allowed only if they preserve the same artifact truth and
the same `ContextIsolatedReasoningUnit` boundary.

**Step 1 — Session ID generation**: `$(date +%Y%m%d)-$(openssl rand -hex 4)` (e.g., `20260325-a3f7b2c1`)

**Step 2 — Session directory creation**:

```text
{project}/.onto/review/{session ID}/
  session-metadata.yaml
  interpretation.yaml
  binding.yaml
  execution-plan.yaml
  review-record.yaml
  synthesis.md
  deliberation.md
  final-output.md
  round1/
  execution-preparation/
    target-snapshot.md
    target-snapshot-manifest.yaml
    materialized-input.md
    context-candidate-assembly.yaml
    actor-invocation-profiles.yaml
    actor-consumer-bindings.yaml
    domain-binding.yaml
    review-value-alignment-criteria.yaml
    review-context-manifest.yaml
  lens-completion-barrier.yaml
```

Productized prompt path 기준으로:

- `round1/*.md`와 `synthesis.md`는 human-readable source layer다
- primary artifact는 `review-record.yaml`이다
- execution preparation artifact seat는 `.onto/processes/review/execution-preparation-artifacts.md`를 따른다

**Step 2.1 — Write invocation artifacts**

The team lead writes:

- `{session path}/interpretation.yaml`
- `{session path}/binding.yaml`
- `{session path}/session-metadata.yaml`
- `{session path}/execution-plan.yaml`

These artifacts must follow:

- `.onto/processes/review/interpretation-contract.md`
- `.onto/processes/review/binding-contract.md`
- `.onto/processes/review/execution-preparation-artifacts.md`

Bounded runtime replacement for deterministic binding:

Preferred combined step:

```bash
npm run review:prepare-session -- \
  --project-root {project} \
  --requested-target "{original target token}" \
  --requested-domain-token "{original domain token or empty}" \
  --target-scope-kind {file|directory|bundle} \
  --primary-ref "{target scope primary ref}" \
  --member-ref "{target scope member ref}" \
  --intent-summary "{interpreted intent summary}" \
  --domain-recommendation "{recommended domain token}" \
  --domain-selection-required "{true|false}" \
  --review-mode-recommendation "{core-axis|full}" \
  --always-include-lens-id "{lens id}" \
  --recommended-lens-id "{lens id}" \
  --rationale "{lens rationale}" \
  --ambiguity-note "{ambiguity note}" \
  --resolved-target-ref "{resolved target ref}" \
  --domain-final-value "{final domain or none}" \
  --domain-selection-mode "{selection mode}" \
  --execution-realization "{worker|host-team}" \
  --host-runtime "{codex|claude}" \
  --review-mode "{core-axis|full}" \
  --lens-id "{lens id}" \
  --materialized-kind "{single_text|directory_listing|bundle_member_texts}" \
  --materialized-ref "{materialized target ref}" \
  --system-purpose-ref "{system purpose ref}" \
  --execution-rule-ref "{execution rule ref}"
```

Decomposed steps:

```bash
npm run review:write-interpretation -- \
  --session-root "{session path}" \
  --target-scope-kind {file|directory|bundle} \
  --primary-ref "{target scope primary ref}" \
  --member-ref "{target scope member ref}" \
  --intent-summary "{interpreted intent summary}" \
  --domain-recommendation "{recommended domain token}" \
  --domain-selection-required "{true|false}" \
  --review-mode-recommendation "{core-axis|full}" \
  --always-include-lens-id "{lens id}" \
  --recommended-lens-id "{lens id}" \
  --rationale "{lens rationale}" \
  --ambiguity-note "{ambiguity note}"

npm run review:bootstrap-binding -- \
  --project-root {project} \
  --requested-target "{original target token}" \
  --requested-domain-token "{original domain token or empty}" \
  --target-scope-kind {file|directory|bundle} \
  --resolved-target-ref "{resolved target ref}" \
  --domain-recommendation "{recommended domain token}" \
  --domain-final-value "{final domain or none}" \
  --domain-selection-mode "{selection mode}" \
  --execution-realization "{worker|host-team}" \
  --host-runtime "{codex|claude}" \
  --review-mode "{core-axis|full}" \
  --lens-id "{lens id}" ...
```

**Step 2.2 — Write execution preparation artifacts**

Before any lens is spawned, the team lead materializes:

- `{session path}/execution-preparation/target-snapshot.md`
- `{session path}/execution-preparation/target-snapshot-manifest.yaml`
- `{session path}/execution-preparation/materialized-input.md`
- `{session path}/execution-preparation/context-candidate-assembly.yaml`

`execution-plan.yaml` is the deterministic seat map for:

- `round1/{lens}.md`
- `synthesis.md`
- `deliberation.md`
- `final-output.md`
- `review-record.yaml`

These artifacts become the basis for all Round 1 lens execution.

Bounded runtime replacement for execution preparation:

```bash
npm run review:materialize-execution-preparation -- \
  --session-root "{session path}" \
  --scope-kind {file|directory|bundle} \
  --resolved-target-ref "{resolved target ref}" \
  --materialized-kind "{single_text|directory_listing|bundle_member_texts}" \
  --materialized-ref "{materialized target ref}" \
  --system-purpose-ref "{system purpose ref}" \
  --execution-rule-ref "{execution rule ref}" ...
```

**Step 3 — Example realization: Team creation via TeamCreate**:
- team_name: `onto-{session ID}`
- description: `Onto Review: {review target summary}`

**Step 4 — Create all teammates**: After TeamCreate, create all lens teammates **simultaneously in a single message** via Agent tool. The initial prompt combines identity + self-loading + task directives. Each review lens is realized as a `ContextIsolatedReasoningUnit`. `synthesize` is dispatched only after controlled lens deliberation has produced `deliberation.md`.
- **core-axis 모드**: 고정 6 lens (`axiology` / `coverage` / `evolution` / `logic` / `semantics` / `structure`)를 생성한다. Cost-constrained Pareto-optimal 구성 (v5 benchmark 기반, 4-axis trade-off).
- **전원 모드 (full) 또는 Complexity Assessment 미수행**: 8명 기존 검증 lens + `axiology`를 생성한다.
- Each teammate's `name`: lens-id (e.g., `logic`)
- Each teammate's `team_name`: team_name created in Step 3
- Initial prompt: use the **Teammate Initial Prompt Template** from `process.md` (including session path)
- 세션 메타데이터에 `review_mode: core-axis | full` 기록

**[Task Directives]** section to include in review lenses' initial prompt:

```
Begin Round 1 review.

[Structural Inspection Checklist]
Perform the following items first (only if applicable to the review target. Mark N/A if not applicable):
- [ ] Are there overlaps (ME violation) between classification items?
- [ ] Are there cases not covered by the classification criteria (CE violation)?
- [ ] Is each item's definition explicitly stated?
- [ ] Is the axis (criteria) used for classification explicitly stated?
- [ ] Are learning items tagged with type tags ([fact]/[judgment])? (Only for learning-related reviews)
- [ ] Are all cross-references between domain document files valid (referenced sections exist, referenced CQ codes exist)? (Only for domain document reviews)
- [ ] Does each sub-area declared in domain_scope.md have substance in at least one other file? (Ghost sub-area check — domain document reviews only)
- [ ] Does each logic_rules.md section have a corresponding CQ in competency_qs.md? (Rule-CQ linkage check — domain document reviews only)
- [ ] Does each concepts.md section referenced by inference paths actually contain the referenced term? (Inference path validity check — domain document reviews only)

[Review Target]
Read `{session path}/execution-preparation/materialized-input.md` and treat it as the authoritative execution input.

[System Purpose and Principles]
{CLAUDE.md/README.md content}

[Directives]
- After the structural inspection, perform content verification from your specialized perspective.
- Answer each core question specifically.
- If an issue is found: specify (1) what the issue is, (2) why it is an issue, and (3) how to fix it.
- If no issues are found, do not just state "no issues" — provide rationale for why it is correct.
- You do not know other agents' perspectives. Judge only from your own perspective.
- Reference past learnings, but ignore learnings that do not apply to the current review target.

[Report Format]
Include the following section at the end of the review finding:

Each Lens-Specific Finding must include the following fields:
- `target`
- `evidence_anchor`
- `claim`
- `lens_id`
- `upstream_evidence_required`
For field semantics, see `.onto/processes/review/lens-prompt-contract.md` §8 Output Schema and `.onto/processes/review/shared-phenomenon-contract.md` §3, §5.
Each finding body should retain the existing what/why/how to fix format.

### Newly Learned
For each learning, determine:
1. **Purpose type**: per learning-rules.md
   (guardrail / foundation / convention / insight)
2. **Impact severity**: high or normal (per criteria in learning-rules.md)
3. **Axis tags**: Apply 2+1 stage test per learning-rules.md

- Communication learning: (findings about user preferences/communication style)
- Learning: [{fact|judgment}] [{axis tags}] [{purpose type}] (content) [impact:{severity}]
  - Axis tags: `[methodology]` and/or `[domain/{session_domain}]`.
    Apply 2+1 stage test per learning-rules.md.
  - If {session_domain} is empty: `[methodology]` only, no `[domain/...]` tag
  - For guardrail type, use template:
    **Situation**: ... **Result**: ... **Corrective action**: ...
  - **Domain fact recording**: If a domain-specific fact (data format,
    industry rule, tool behavior, regulatory constraint, etc.)
    **influenced your review judgment** during this session,
    record it as a separate `[fact] [domain/{session_domain}]` learning entry.
Mark each as "none" if there is nothing to report.

### Applied Learnings
List learnings from your learning file that influenced your review judgment:
- Learning: {summary} (source: {source})
  - "이 학습이 없었다면 이번 리뷰에서 놓쳤을 발견이 있는가?" (yes/no)
- If a loaded learning was applied but found invalid/harmful during this review,
  attach event marker to the learning file:
  `<!-- applied-then-found-invalid: {date}, {session_id}, {reason} -->`
  (Event marker attachment is agent-autonomous — no approval needed.)
Mark "none" if no learnings were applied.

### Domain Constraints Used
List each durable provenance entry in `{source_doc, source_version_or_snapshot_id, anchor}` format.
If `session_domain=none`, write `[]`.

### Domain Context Assumptions
List informal usage-context assumptions used during the review.
Write `[]` if none.
```

**[Task Directives]** section to include in the synthesize initial prompt:

```
The team lead will deliver lens result paths once the review lenses complete their Round 1 review. Wait until then.
```

**This is the only independent round.** In subsequent steps, other lens perspectives are shared through the synthesize stage.

#### Step 2 — Example realization: Codex Mode Variation

Codex 모드에서는 TeamCreate를 생략한다. 대신 각 review lens를 `codex:codex-rescue` worker_type의 Agent tool로 생성한다. 이 경우에도 canonical requirement는 `ContextIsolatedReasoningUnit` 유지다.

**Sub-step 2.3 — Team creation**: 생략. TeamCreate/TeamDelete를 사용하지 않는다.

**Sub-step 2.4 — Create all reviewer Agents**: 모든 review lens Agent를 **단일 메시지에서 동시에** 호출하되, 각각 `run_in_background: true`로 설정한다.
- 각 Agent의 `worker_type`: `"codex:codex-rescue"`
- 각 Agent의 프롬프트: `process.md`의 **Codex Reviewer Prompt Template** 사용
- core-axis 모드: 고정 6 lens (axiology / coverage / evolution / logic / semantics / structure) Codex task로 생성. (Step 1.5 dynamic selection 활성 시 2-6 lens + axiology)
- 전원 모드(full): 8명 전원 Codex task로 생성
- `synthesize`는 이 단계에서 생성하지 않는다 (메인 프로세스 Step 3에서 별도 실행)
- `codex.model`/`codex.effort` 전달: process.md "Model and effort" 섹션 참조
- 세션 메타데이터에 `execution_realization: worker`, `host_runtime: codex` 기록

`synthesize`의 초기 prompt 대신: 팀 리드가 모든 백그라운드 task 완료를 대기한다.

Task Directives는 Agent Teams 모드와 **동일한 내용**을 사용한다. 차이점은 프롬프트 래핑(Codex Reviewer Prompt Template)과 실행 런타임뿐이다.

#### Step 2 — Example realization: Direct Worker Variation (claude)

`execution_realization: worker` + `host_runtime: claude` 경로다. 각 review lens를 `general-purpose` worker_type의 Agent tool로 생성한다. canonical requirement는 `ContextIsolatedReasoningUnit` 유지다.

**Sub-step 2.3 — Team creation**: 생략. TeamCreate/TeamDelete를 사용하지 않는다.

**Sub-step 2.4 — Create all reviewer Agents**: 모든 review lens Agent를 **단일 메시지에서 동시에** 호출하되, 각각 `run_in_background: true`로 설정한다.
- 각 Agent의 `worker_type`: `"general-purpose"`
- 각 Agent의 프롬프트: `process.md`의 **Teammate Initial Prompt Template**을 baseline으로 사용하되, self-loading이 불가하므로 팀 리드가 agent definition + learning file + domain document + communication learning + task directives + session path를 직접 inline한다.
- core-axis 모드: 고정 6 lens (axiology / coverage / evolution / logic / semantics / structure) 생성. (Step 1.5 dynamic selection 활성 시 2-6 lens + axiology)
- 전원 모드(full): 8명 전원 생성
- `synthesize`는 이 단계에서 생성하지 않는다 (메인 프로세스 Step 3에서 별도 실행)
- 세션 메타데이터에 `execution_realization: worker`, `host_runtime: claude` 기록

`synthesize`의 초기 prompt 대신: 팀 리드가 모든 백그라운드 task 완료를 대기한다.

Task Directives는 Agent Teams 모드와 **동일한 내용**을 사용한다. 차이점은 self-loading 메커니즘(직접 inline)과 dispatch 채널(Agent tool)뿐이다. 재시도 정책은 Codex Mode Variation과 동일하게 §3 dispatch 표를 따른다.

#### Error Recovery (Round 1)

> process.md Error Handling Rules의 Retry Protocol을 적용한다.

Round 1에서 에이전트 에러 발생 시:

1. **감지**: 다른 에이전트가 전원 응답을 완료한 시점에 아직 응답하지 않은 에이전트,
   또는 에러를 보고한 에이전트를 감지한다.

2. **재시도**: §3 dispatch 표 (Synthesize 단계)의 dispatch 메커니즘과 동일한 채널을 사용한다. host-team는 SendMessage 재요청, worker 계열은 동일 프롬프트로 Agent tool re-spawn. `worker_type` 값은 §3 표가 단일 source다 (drift 방지를 위해 본 단계에서 재나열하지 않는다). 재시도 메시지/프롬프트에 원래 Task Directives + 파일 경로를 포함한다.

3. **종료 조건**: 2회 재시도 후에도 실패하면 graceful degradation 적용.
   해당 에이전트를 제외하고 합의 분모를 조정.
   synthesize 전달 시: "※ {agent-id}: 에러로 제외됨" 명시.
   ※ 본 2회 상한은 모든 realization에 공통으로 적용된다 — 새 realization 추가 시 본 값의 적정성을 재평가한다.

4. **로깅**: {session path}/error-log.md에 에러 이력 기록.
   (디버깅 참조용. 자동 소비 경로 없음.)

에러 제외 후 잔존 review lens가 2명 미만이면 process-halting. 주체자에게 전원 리뷰 전환 또는 중단을 제안한다.

---

### 3. Reference Execution — Synthesize

Synthesize 단계의 dispatch 메커니즘은 `execution_realization` × `host_runtime` 두 축의 조합으로 분기한다. 어느 경로든 lens 결과 + execution-preparation artifacts + controlled deliberation result를 그대로 전달한다는 본질은 동일하다.

<!-- derived-from: .onto/processes/review/binding-contract.md, resolved_execution_realization × resolved_host_runtime -->

| `execution_realization` | `host_runtime` | Dispatch 메커니즘 | Deliberation 처리 | Synthesize 실패 정책 |
|---|---|---|---|---|
| `host-team` | `claude` | SendMessage to `synthesize` teammate | synthesize 전에 controlled lens deliberation 완료 | 1회 SendMessage 재요청; 실패 시 `process-halting-with-partial-result` |
| `worker` | `claude` | Agent tool with `worker_type: "general-purpose"` | synthesize 전에 controlled lens deliberation 완료 | 1회 동일 프롬프트로 Agent re-spawn; 실패 시 `process-halting-with-partial-result` |
| `worker` | `codex` | Agent tool with `worker_type: "codex:codex-rescue"` | synthesize 전에 controlled lens deliberation 완료 | 1회 동일 프롬프트로 Agent re-spawn; 실패 시 `process-halting-with-partial-result` |

본 표의 discriminator는 binding artifact의 `resolved_execution_realization` + `resolved_host_runtime` 두 필드와 1:1 대응한다 (별도 enum이 아니다). 2축의 카르테시안 곱 중 `host-team + codex` 조합은 현재 unsupported다 — `.onto/processes/review/productized-live-path.md` §3.6 참조.

**Audit observability rule**: 모든 경로는 `deliberation.md`를 산출한다. `synthesis.md`는 그 결과를 소비하고 보존적으로 최종 review output을 작성한다.

이하 본 절은 `host-team` 경로의 SendMessage 전달 콘텐츠를 정의한다. **Since the original text is preserved in the files, the team lead does not include the original text in the message.**

SendMessage content to deliver to the synthesize stage:

```
Synthesize the review lenses' Round 1 review results and adjudicate while preserving lens evidence and system purpose.

[Review Lens Result Files]
Read the files at the paths below directly using the Read tool:
{참여 에이전트의 review result 파일 경로 목록}
※ 경량 모드에서는 참여하지 않은 에이전트의 파일을 포함하지 않는다.

[Execution Preparation Artifacts]
Read the files below directly using the Read tool:
- {session path}/interpretation.yaml
- {session path}/binding.yaml
- {session path}/session-metadata.yaml
- {session path}/execution-preparation/target-snapshot.md
- {session path}/execution-preparation/materialized-input.md
- {session path}/execution-preparation/context-candidate-assembly.yaml

※ Results from agents whose Write failed are included directly below:
{Original text of Write-failed agents (only if applicable)}

[System Purpose and Principles]
{CLAUDE.md/README.md content}

[Directives]
Step 1 — Synthesis:

## Review Synthesis

### Consensus
- (Judgments shared across participating review lenses. Frame this as common judgment, not simple majority.)

### Conditional Consensus
- (Judgments that align under explicit conditions, scope limits, or reservations)

### Disagreement
- (Conflicting judgments + summary of each rationale. Preserve unresolved tension explicitly.)

### Overlooked Premises
- (Items not mentioned by any lens but requiring examination given the system purpose/principles)
- Refer to the "Verification Dimension Coverage Checklist" in process.md to confirm that no review lens dimension has gone uncovered.

### Axiology-Proposed Additional Perspectives
- (Include only perspectives explicitly proposed by `axiology`)
- Do not invent a new independent perspective here.

### Purpose Alignment Verification
- (Preserve and summarize the purpose/value alignment judgment provided by `axiology`)

### Immediate Actions Required
- (Items that should be applied immediately based on preserved lens evidence)

### Recommendations
- (Follow-up recommendations that are not immediate actions)

Step 3 — Unique Finding Tagging:

### Unique Finding Tagging
Classify at the lens-qualified claim unit, not by per-lens majority buckets. Mark whether each claim remains unique to one lens or belongs to a shared phenomenon observed by multiple lenses.

### Deliberation Decision
- Preserve the controlled lens deliberation result from `{session_root}/deliberation.md`.

### Final Review Result
- (Comprehensive principal-facing explanation of the bounded review result. Preserve lens evidence, controlled deliberation outcome, issue/root-cause clustering, problem framing, and system purpose.)

### Shared Phenomenon Summary
- Group lens-qualified claims by co-location (`target` + `evidence_anchor`).
- For each co-located group, classify claim relation per `.onto/processes/review/shared-phenomenon-contract.md` §4: `corroboration`, `disagreement`, `partial overlap`, or `dedup`.

Step 4 — Adjudication:
Follow `.onto/processes/review/synthesize-prompt-contract.md` §4 Mandatory Execution Rules and §6 Deliberation Rule as the canonical adjudication rule.
Do not use simple majority as a substitute for reasoning.
In removal vs. retention conflicts, especially when `conciseness` is involved, compare the rationales against system purpose and preserve unresolved disagreement when it cannot be closed.

### Deliberation Consumption

Controlled lens deliberation is completed before synthesize. Every execution path
produces the same `{session_root}/deliberation.md` artifact, and synthesize
preserves that artifact as the contested-position authority:

---
session_id: {session ID}
process: review
target: "{review target summary}"
domain: {session_domain / none}
date: {YYYY-MM-DD}
---

## 9-Lens Review Result

### Review Target
{review target summary}

### Verification Context
- Domain: {session_domain / none (no-domain mode)}
- Domain rule documents: {N}/7 loaded {list of absent documents}
- (If session_domain is empty) "Verified using agent default methodology (no-domain mode). Domain-specific issues may be missed."
- (If domain documents are absent but session_domain is set) "Verified using general principles (no domain document). Adding domain documents will improve verification precision."

### Consensus (N/{participating agent count})
※ 합의 분모는 실제 참여한 review lens 수 (고정값 9가 아님). 경량 모드 및 에러 제외를 반영.
- (List of judgments shared across participating review lenses)

### Conditional Consensus
- (Judgments that align only under explicit conditions, scope limits, or reservations)

### Disagreement
원 lens 입장을 보존하는 섹션이다. Resolution은 synthesize 이전의 controlled deliberation result에서 온다.
Tag each disagreement item with a type:
- **[Factual discrepancy]** — verifiable via external reference (code, documents). PO action: gather additional information
- **[Criteria discrepancy]** — resolvable by applying a higher-level principle. PO action: confirm/decide on the higher-level principle
- **[Value discrepancy]** — no conditions for reaching consensus, unresolvable through repetition. PO action: make a direct value judgment
(When deliberation was performed, this section appears in the deliberation output format instead.)

### Overlooked Premises
- (Premises not directly raised by any participating lens but still requiring examination)

### Axiology-Proposed Additional Perspectives
- (Only if explicitly proposed by `axiology`)

### Purpose Alignment Verification
- (Preserve and summarize the purpose/value alignment judgment provided by `axiology`)

### Immediate Actions Required
- (Among consensus items, those that should be applied immediately)

### Recommendations
- (Among consensus items, those that can be applied later)

### Unique Finding Tagging
Classify at the lens-qualified claim unit rather than by per-lens majority buckets.

| Target + Evidence Anchor | Classification | Participating Lenses | Notes |
|---|---|---|---|
| (Record representative claim units or co-located groups) | unique claim / shared phenomenon | | |

### Deliberation Decision
- (Resolved / narrowed / unresolved-with-reason decisions copied from `{session_root}/deliberation.md`)

### Final Review Result
- (Comprehensive principal-facing explanation of the bounded review result. Preserve lens evidence, controlled deliberation outcome, issue/root-cause clustering, problem framing, and system purpose.)

### Shared Phenomenon Summary
Classify co-located claim groups per `.onto/processes/review/shared-phenomenon-contract.md` §4.

| Target | Evidence Anchor | Participating Lenses | Claim Relation | Notes |
|---|---|---|---|---|
| | | | corroboration / disagreement / partial overlap / dedup | |
```

Synthesize는 deliberation 필요 여부를 판정하지 않는다. Step 4는 synthesize 전에 완료되어 있어야 한다.

#### Step 3 — Example realization: Codex Mode Variation

Codex 모드에서는 `synthesize`도 `codex:codex-rescue` Agent로 실행한다.

- 팀 리드가 `synthesize`를 foreground `codex:codex-rescue` Agent로 생성한다 (백그라운드 아님 — 결과를 즉시 사용해야 하므로).
- 프롬프트: `process.md`의 **Codex Review Synthesize Prompt Template** 사용.
- 프롬프트에 review lens의 결과 파일 경로를 포함한다. Codex가 파일을 직접 읽고 종합한다.
- 결과를 `{session path}/synthesis.md`에 저장하도록 지시한다.
- 프롬프트는 `{session path}/deliberation.md`를 읽고 그 resolution을 보존한다.
- `synthesize` 실패 시: 1회 재시도 후에도 실패하면 `process-halting-with-partial-result`를 적용한다 (process.md Error Handling Rules 참조).

---

### 4. Reference Execution — Controlled Lens Deliberation

본 단계는 모든 completed review 경로에서 synthesize 전에 실행한다.

Agent Teams 경로에서는 SendMessage transport를 사용할 수 있다. MCP/TS 경로에서는 같은 의미론을 bounded deliberation prompt packet으로 실행한다.

In this step, **direct SendMessage between teammates is permitted**.
The team lead notifies the relevant lenses (including `synthesize`) of deliberation commencement:

```
Deliberation begins.
Engage in direct deliberation with the relevant lenses on the items below.

[Deliberation Items]
Items classified by type by the synthesize stage:

**Contradicting opinions** (resolution method: direct exchange between opposing agents)
{applicable items. "None" if none}

**Overlooked premises** (resolution method: request additional verification from related lenses)
{applicable items. "None" if none}

**New perspectives** (resolution method: request validity assessment from related lenses)
{applicable items. "None" if none}

[Deliberation Participants]
{Lens list designated by the synthesize stage}

[Deliberation Rules]
- Before starting deliberation, first confirm whether the definitions of key terms used in contested points are aligned among participating agents. Attempt definition alignment within 1 round-trip. If alignment is not reached, proceed with each agent stating their own definition. This round-trip does not count toward the 3-trip limit.
- Respond directly to the counterpart's arguments. Do not merely repeat your own position.
- If the counterpart's argument is valid, accept it.
- If a new alternative combining both sides' arguments is possible, propose it.
- If a derived contested point arises during deliberation that falls outside the original participants' areas of expertise, request the team lead to include the relevant specialist lens. If addition is not possible, record the contested point as an "unverified item."
- Round-trip definition: the team lead delivers the contested point and the relevant agents return their responses — this constitutes 1 round-trip. The team lead manages the round-trip count.
- If consensus is not reached after 3 round-trips, each party reports their final position to the team lead.
```

After deliberation concludes, the team lead delivers the results to `synthesize` to **write the final output**:

```
Write the final output reflecting the deliberation results.

[Deliberation Results]
{full deliberation results}

[Output Format]
---
session_id: {session ID}
process: review
target: "{review target summary}"
domain: {session_domain / none}
date: {YYYY-MM-DD}
---

## 9-Lens Review Result

### Review Target
### Verification Context
### Consensus (N/{participating agent count})
### Conditional Consensus
### Disagreement
Tag each disagreement item with a type:
- **[Factual discrepancy]** — verifiable via external reference (code, documents). PO action: gather additional information
- **[Criteria discrepancy]** — resolvable by applying a higher-level principle. PO action: confirm/decide on the higher-level principle
- **[Value discrepancy]** — no conditions for reaching consensus, unresolvable through repetition. PO action: make a direct value judgment
### Unverified
Items classified as outside the verification scope (e.g., cases where adding a specialist agent for derived contested points was not possible). PO action: request separate verification from a domain expert, or accept as tolerable risk.
### Axiology-Proposed Additional Perspectives
- (Only if explicitly proposed by `axiology`)

### Purpose Alignment Verification
- (Preserve and summarize the purpose/value alignment judgment provided by `axiology`)
### Immediate Actions Required
### Recommendations
```

---

### 5. Reference Execution — Final Output + ReviewRecord Assembly

The team lead first writes `final-output.md`, then assembles `review-record.yaml`, then delivers the final output to the user.

Preferred bounded completion step:

```bash
npm run review:complete-session -- \
  --project-root {project} \
  --session-root "{session path}" \
  --request-text "{original user request}"
```

Minimum `review-record.yaml` assembly input:

- `interpretation.yaml`
- `binding.yaml`
- `session-metadata.yaml`
- `execution-preparation/*`
- `round1/*.md`
- `synthesis.md`
- `final-output.md`
- `error-log.md` (optional; required when degradation occurred)

The aggregate contract follows `.onto/processes/review/record-contract.md`.
Field mapping follows `.onto/processes/review/record-field-mapping.md`.

`final-output.md` should be the persisted human-readable rendering of the same final result delivered to the user.

If available, use the bounded finalization runtime step:

```bash
npm run review:finalize-session -- \
  --project-root {project} \
  --session-root "{session path}" \
  --request-text "{original user request}"
```

Internal implementation alias:

```bash
npm run review:assemble-record -- \
  --project-root {project} \
  --session-root "{session path}" \
  --request-text "{original user request}"
```

This is the first `구현 치환 단계 (ImplementationReplacementStep)` for review aggregate assembly.

Assembly rules:

- if `error-log.md` records failed/excluded lenses but final output exists, set `record_status: completed_with_degradation`
- if `deliberation.md` is absent, fail assembly
- if `synthesis.md` does not declare `deliberation_status: performed`, fail assembly
- if `deliberation.md` exists and `synthesis.md` declares `performed`, set `deliberation_status: performed`

---

### 6. Example realization — Wrap-Up (Learning Storage + Team Shutdown)

1. **Learning storage**: Stores learnings from all members. Follows the "Learning Storage Rules" in `learning-rules.md`. If deliberation occurred, also includes learnings generated during the deliberation process. **Learning data collection must be completed before team shutdown.**
   - **Seed review learning tag**: When reviewing a seed domain (`drafts/{domain}`), learnings about the seed domain's content are tagged with `[domain/{seed-domain}]`.

2. **Promotion guidance** (conditional): Provide guidance only if new domain learnings were stored in this review:
   "Project domain learnings have accumulated to {N} entries. Promotion remains a separate learn/govern design path."

3. **Team shutdown**:
   - Agent Teams: The team lead sends shutdown_request to all members via **individual SendMessage** (structured messages cannot use `to: "*"` broadcast). After all members have shut down, clean up the team via TeamDelete.
   - Codex 모드: 팀 라이프사이클 관리가 없다. 모든 Codex task는 실행 완료 후 자동 종료된다. 팀 리드는 학습 저장 완료 후 세션을 종료한다.
