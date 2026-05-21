# Review Synthesize Prompt Contract

> 상태: Active
> 목적: 현재 `onto` 프로토타입의 `종합 단계 (synthesize)`가 따라야 하는 `종합 프롬프트 계약 (SynthesizePromptContract)`을 고정한다.
> 기준 문서:
> - `.onto/processes/review/lens-registry.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/issue-stance-deliberation-contract.md`
> - `process.md`
> - `.onto/processes/review/review.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

`종합 프롬프트 계약 (SynthesizePromptContract)`은
`synthesize`가 lens finding을 읽고 final review output을 만드는 단계의 공통 실행 계약이다.

이 계약의 source material은 아래다.

- `.onto/roles/synthesize.md`
- `process.md`의 `Codex Review Synthesize Prompt Template`
- `.onto/processes/review/review.md`의 Step 3/4

---

## 2. Core Role

`synthesize`는 독립 lens가 아니다.
다만 실행 realization은 필요에 따라
**맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)** 일 수 있다.

역할은 아래다.

1. lens finding을 읽는다
2. consensus를 정리한다
3. disagreement를 보존한다
4. overlooked premises를 드러낸다
5. immediate actions와 recommendations를 정리한다
6. final review output을 작성한다

단, purpose/value 관점에서의 추가 검토 관점 제안(`New Perspectives`)은
`axiology`의 책임이다.
`synthesize`는 그것이 명시적으로 제시된 경우에만 보존/배치할 수 있다.

---

## 2.1 Language Policy

Synthesize output 은 `.onto/principles/output-language-boundary.md` 의 two-axis 정책을 따른다.

- **Synthesis markdown body (consensus · disagreement · deliberation decision · per-item provenance · frontmatter)** 는 **English 고정**. 본 body 는 `ReviewRecord` 의 source 이며 subsequent session · learning extraction · audit 의 입력이 된다. 번역이 섞이면 cross-session 비교와 promote 파이프라인이 깨진다.
- **Principal 직접 소비 섹션 (final review result 요약 등)**: `synthesis.md` 가 principal 에게 노출되는 최종 리포트이기도 하지만, 현재 프로토타입에서는 body 전체가 그대로 출력된다. "user-visible final summary" 를 별도 구조로 분리하여 Runtime Coordinator 의 render seat (`src/core-runtime/translate/render-for-user.ts`) 를 통해 번역하는 것은 후속 PR 의 scope 다 (`.onto/principles/output-language-boundary.md` §3.3).
- 따라서 본 계약은 synthesize 프롬프트 템플릿에 `output_language` 를 **주입하지 않는다**.

Synthesize 내부 추론 언어 (deliberation reasoning, adjudication basis) 도 English 로 유지한다. 본 reasoning 은 `Deliberation Decision` 섹션에 기록되어 향후 세션에서도 참조된다.

---

## 3. Required Inputs

`종합 프롬프트 계약 (SynthesizePromptContract)`의 최소 입력은 아래다.

1. participating lens list
2. lens result file paths
3. system purpose and principles
4. resolved review mode
5. materialized input ref (deliberation 시 evidence 재읽기 대상)
6. `synthesis_output_path`
7. self-loading context refs
   - synthesize learnings
   - communication learning
   - project-level synthesize learnings
   - learning rules

`output_language` 는 의도적으로 본 목록에서 제외되었다 — §2.1 Language Policy 참조.

### 3.1 Input Expectations (Lens Output Fields)

각 lens result file은 `lens-prompt-contract.md` §8 (schema_version: 2)에 따라
최소 아래 필드를 포함해야 한다. synthesize는 이 필드들의 수신을 필수로 기대한다.

- **4-field claim**: `{target, evidence_anchor, claim, lens_id}` — 각 finding별
- **`upstream_evidence_required`**: 해당 시
- **`domain_constraints_used`**: 해당 시 (durable provenance 형식)
- **`domain_context_assumptions`**: 해당 시

4필드의 의미와 co-location rule은 `.onto/processes/review/shared-phenomenon-contract.md`가 정의한다.
이 계약은 수신 필수만 선언하며, 필드 의미를 재정의하지 않는다.

---

## 4. Mandatory Execution Rules

`synthesize`는 아래 규칙을 지켜야 한다.

1. 새로운 독립 관점을 추가하지 않는다
2. lens finding을 건너뛰고 ad hoc 결론을 만들지 않는다
3. unresolved disagreement를 묵살하지 않는다
4. lens 간 disagreement resolution은 synthesize 이전의 controlled lens deliberation 결과를 따른다
5. review의 primary output을 learning candidate로 정의하지 않는다
6. `New Perspectives`를 스스로 invent하지 않는다
7. `Purpose Alignment Verification`은 독립 판단으로 새로 만들지 않고, `axiology` finding을 보존적으로 반영한다

---

## 5. Output Obligation

현재 프로토타입 기준의 synthesize output은 markdown 파일이다.

최소 아래를 포함해야 한다.

또한 output은 YAML frontmatter로 시작해야 하며, 최소 아래 field를 가져야 한다.

```yaml
---
deliberation_status: performed
participation:
  expected_lenses: [<lens_id>, ...]         # binding 이 active 로 선언한 lens id 목록
  received_lenses: [<lens_id>, ...]         # output 을 성공적으로 산출한 lens id
  missing_or_failed_lenses:                 # expected 에 있으나 received 에 없는 lens
    - { lens_id: <id>, reason: missing | failed | abstained }
  run_status: full | degraded | insufficient
---
```

### 5.1 `deliberation_status` 값 규칙

완료된 synthesize output은 `performed`만 선언한다.

- `performed`: synthesize 이전에 controlled lens deliberation이 실행되었고 synthesize가 그 결과를 소비한 경우.

### 5.2 Participation completeness (IA-2)

- `expected_lenses` / `received_lenses` / `missing_or_failed_lenses` / `run_status` 는 `.onto/roles/synthesize.md` §Participation completeness 가 요구하는 측정 결과의 직렬화다
- `run_status` 매핑: `full` = expected == received. `degraded` = received 가 expected 의 non-empty 부분집합. `insufficient` = received 가 비어있거나 `axiology` 단독
- `run_status=insufficient` 이면 consensus / disagreement 섹션은 "data insufficient" marker 로 남기고 합의 claim 을 produce 하지 않는다
- 이 frontmatter 는 degraded run 을 full consensus 로 오독하는 것을 방지하는 audit 근거다

### 5.2.1 Internal Body vs Principal Summary (Output Structural Split)

> **Status**: contract established, implementation deferred. 구현 trigger 조건 + scope 는 `.onto/processes/review/lens-prompt-contract.md §8.5` 와 동일 — 본 절은 lens 쪽 contract 의 synthesize 대응을 선언한다.

#### 5.2.1.1 두 층의 경계

| 층 | 섹션 범위 | 소비자 | 언어 정책 |
|---|---|---|---|
| **Internal Body** | §5.3 의 section list (1-12 번) 전체 | ReviewRecord assembler, learning extraction, audit | English 고정 |
| **Principal Summary** (선택적 신설 섹션) | `## Principal Summary` — §5.3 의 items 중 Principal 직접 소비 가치가 있는 subset 의 prose 요약 | Principal | `output_language` 에 따라 translation target |

#### 5.2.1.2 Synthesize 특유 rationale

Synthesize 는 Principal 이 **primary 소비자**이지만, 구조 (frontmatter + section list + per-item provenance) 는 ReviewRecord / learning extraction 을 위해 고정되어 있다 (§5.3 canonical taxonomy, §5.5 provenance). 두 소비자를 동시에 서빙하려면:

- Internal Body 는 §5.3 canonical taxonomy + §5.5 per-item provenance 유지 (machine-readable)
- Principal Summary 는 Internal Body 의 key findings 을 prose 로 재진술 (human-readable)

본 split 없이 synthesize output 전체를 번역하면 ReviewRecord / learning extraction 이 번역된 텍스트 기반이 되어 cross-session 비교 불가.

#### 5.2.1.3 Contract invariant (구현 시)

- Internal Body section list (§5.3) 는 변경되지 않음
- Principal Summary 는 Internal Body 에 없는 claim 도입 금지 (재진술만)
- renderPointId: `review_synthesize_principal_summary` (본 섹션 활성 시 `.onto/authority/external-render-points.yaml` 신설)
- `output_language: en` 일 때 Principal Summary 생략 가능
- lexicon term 취급: `authoring_rules.translation_policy` 규칙 (preserved/translated/bilingual) 적용

#### 5.2.1.4 ReviewRecord 영향

record-contract §4.5 Synthesis Layer 는 Internal Body 만 source. Principal Summary 는 runtime-derived (재생성 가능). 따라서 ReviewRecord schema 추가 필드 불필요.

### 5.3 Section list (canonical taxonomy)

아래는 이 contract 가 정하는 **단독 canonical section 명칭** 이다. 동의어는 §5.4 alias map 을 따르며 이 list 로 정규화한다.

1. consensus
2. conditional consensus
3. disagreement
4. overlooked premises
5. axiology-proposed additional perspectives (if any)
6. purpose alignment verification
7. immediate actions
8. recommendations
9. unique finding tagging
10. deliberation decision
11. final review result
12. shared phenomenon summary — 동일 phenomenon에 대한 다중 lens claim이 있는 경우, claim relation 분류 결과를 명시한다 (corroboration / disagreement / partial overlap / dedup). 분류 규칙은 `.onto/processes/review/shared-phenomenon-contract.md` §4를 따른다. 이 계약은 분류 규칙을 재정의하지 않는다

### 5.4 Alias map (IA-3)

canonical label 과 자주 drift 되는 alias 쌍. synthesis output 은 canonical label 만 사용한다.

| Canonical | Alias (금지) |
|---|---|
| `disagreement` | `contradiction`, `conflict` (lens 간 의견 차이 의미일 때) |
| `conditional consensus` | `conditional agreement`, `conditional agreement (with stipulation)` |
| `immediate actions` | `recommended actions (urgent)`, `required actions` |
| `recommendations` | `recommended actions (non-urgent)`, `suggestions` |
| `axiology-proposed additional perspectives` | `axiology-proposed new perspectives`, `new perspectives` (role header 제외) |

alias 발견 시 synthesis output 은 canonical 로 정규화한다. prompt packet materializer 는 §5.3 label 만 emit 한다.

### 5.5 Per-item provenance (IA-4)

sections 1–12 의 각 item 은 아래 provenance 필드를 갖는다. 명시 형식은 markdown 내 bullet 로 기술한다 (직렬 예시 §5.5.1).

- **supporting_lenses** — 이 item 의 claim 을 지지한 lens id 목록
- **contesting_lenses** — 이 item 에 대해 반대 claim 을 제기한 lens id 목록. 없으면 빈 배열
- **adjudication_basis** — 이견이 해소된 경우 `.onto/roles/synthesize.md` §Adjudication boundary 의 3 경로 중 어느 것 (`cited_lens_output` / `declared_rule_resolved_artifact` / `deliberation_artifact`) + 해당 근거 anchor (파일 경로 / lens output 위치). 미해소 시 `unresolved`
- **evidence_gaps** — 해소에 부족한 증거 영역 (있는 경우, 1~2 문장)

#### 5.5.1 직렬 예시

```markdown
- **consensus-1**: 모든 lens 가 X 접근이 목적 정렬에 부합한다고 판단한다.
  - supporting_lenses: [logic, structure, semantics, dependency, pragmatics, evolution, coverage, conciseness, axiology]
  - contesting_lenses: []
  - adjudication_basis: cited_lens_output (round1/logic.md §3, round1/structure.md §2, ...)
  - evidence_gaps: null
```

### 5.6 Immediate actions priority rule (IA-1)

§5.3 item 7 `immediate actions` 에 부여되는 priority 는 아래 중 하나의 declared source 에 근거해야 한다.

- cited lens output 이 "immediate" 또는 "blocking" 으로 표기한 finding
- declared rule-resolved artifact (예: `shared-phenomenon-contract` 가 blocking 으로 분류) 
- deliberation artifact 가 priority 를 명시

위 source 중 어느 것도 없는 action 은 `recommendations` (§5.3 item 8) 로 분류하거나 priority 없이 `immediate actions` 에 unprioritized marker 와 함께 유지한다. synthesize 가 "합리적 판단" 으로 priority 를 부여하는 것은 §Adjudication boundary 금지 경로다.

**Runtime packet과의 정합성**: 위 12개 항목 중 4 (overlooked premises), 11 (final review result), 12 (shared phenomenon summary)는 현 runtime packet (`materialize-review-prompt-packets.ts`)이 별도 heading으로 강제하지 않는다. 4와 12는 9개 분류 섹션 (Consensus / Conditional Consensus / Disagreement / Unique Finding Tagging)이 적용하는 Tagging Completeness Rule에 흡수되며, 11은 synthesis output 자체와 등가다. 이 3개 항목을 별도 heading으로 부활시킬지 또는 이 contract에서 제거할지는 packet 갱신 PR이 단일 결정 seat이며, 본 contract는 그 결정 시점까지 12개 enumeration을 conceptual reference로 보존한다.

즉 현재 prompt-backed reference path에서는
`synthesis markdown`이 canonical prompt output이다.

later productization에서는 이 output이
`ReviewRecord`의 human-readable layer source가 된다.

aggregate primary artifact는
`.onto/processes/review/record-contract.md`에서 정의하는 `ReviewRecord`다.

---

## 6. Deliberation Rule

### 6.1 Canonical Deliberation Position

Deliberation은 synthesize 내부 동작이 아니다.

Review는 Round 1 lens 실행 뒤 synthesize 전에 controlled lens deliberation을 수행하고,
그 결과를 `{session_root}/deliberation.md`에 기록한다.

canonical properties:

1. lens별 deliberation response는 fresh bounded context에서 실행된다.
2. 각 response 입력은 자기 Round 1 출력과 다른 participating lens 출력으로 제한된다.
3. teamlead-controlled deliberation result가 합의, 조건부 합의, 지속 이견, resolution을 기록한다.
4. synthesize는 `deliberation.md`를 읽고 보존적으로 최종 review output을 작성한다.
5. synthesize는 새로운 disagreement resolution을 만들지 않는다.

Claude Code Agent Teams에서는 이 단계가 SendMessage transport로 실현될 수 있다.
MCP/TS runtime에서는 같은 의미론을 provider 독립 packet으로 실현한다.

Issue-stance deliberation target에서는 synthesize가 추가로 아래 artifact를 소비한다.

- `{session_root}/finding-ledger.yaml`
- `{session_root}/finding-relation-graph.yaml`
- `{session_root}/issue-ledger.yaml`
- `{session_root}/issue-stance-matrix.yaml`
- `{session_root}/deliberation-plan.yaml`
- `{session_root}/deliberation.md`
- `{session_root}/problem-framing.yaml`

이 경우 synthesize는 issue status를 새로 판정하지 않는다.
`no-deliberation-needed`, `resolved`, `narrowed`, `unresolved-with-reason`은
`.onto/processes/review/issue-stance-deliberation-contract.md`가 소유한다.
또한 synthesize는 `problem-framing.yaml`의 common spine, timing, closure, domain axes classification을 변경하지 않는다.
Domain-specific axes are loaded and applied before synthesize from `.onto/domains/{domain}/problem_framing_profile.md`.

### 6.2 frontmatter `deliberation_status`

Synthesize output은 `deliberation_status: performed`를 emit해야 한다.
이 값은 synthesize가 deliberation actor였다는 뜻이 아니라,
synthesize가 required controlled deliberation artifact를 소비했다는 뜻이다.

### 6.3 `deliberation.md` artifact 위상

`{session_root}/deliberation.md`는 conflict-resolution authority다.

- 존재하지 않으면 completed review로 assemble할 수 없다.
- frontmatter는 `deliberation_status: performed`를 선언해야 한다.
- `Deliberation Decision`은 contested point별로 resolved / narrowed / unresolved-with-reason을 기록한다.
- synthesize output의 `Deliberation Decision` 섹션은 이 artifact를 보존적으로 반영한다.

---

## 7. Example Prompt Skeleton

```text
You are synthesize.

[Your Definition]
{Content of .onto/roles/synthesize.md}

[Context Self-Loading]
{synthesize learnings / communication / project learnings / learning rules}

[Language Policy]
Respond in English. Reasoning, tool arguments, YAML / markdown emits, and
hand-offs to other agents stay English-only regardless of `output_language`.
Principal-facing translation happens at the Runtime Coordinator's render seat
(.onto/principles/output-language-boundary.md).

[Task Directives]
- Read all lens result files, the materialized input, and `{session_root}/deliberation.md`.
- Preserve consensus and original lens positions in Disagreement.
- Preserve the controlled deliberation decisions; do not create a new resolution inside synthesize.
- Set frontmatter deliberation_status to `performed`.
- Write the final synthesis output to {synthesis_output_path}.
```

---

## 8. What This Contract Must Not Do

이 계약은 아래를 하면 안 된다.

1. 독립 lens처럼 자기만의 별도 검증 관점을 추가한다
2. `axiology`를 대체한다
3. lens evidence 없이 결론을 덮어쓴다
4. `New Perspectives`를 독자적으로 제안한다

즉 `synthesize`는
새로운 검증자가 아니라 `구조 보존형 종합 단계`다.

가능한 realization 예와 deliberation 경로 (§6.1):

<!-- derived-from: .onto/processes/review/binding-contract.md, resolved_execution_realization × resolved_host_runtime -->

| Realization | Deliberation 경로 |
|---|---|
| Agent Teams teammate | SendMessage transport |
| subagent (Claude Code Agent tool) | bounded deliberation packet |
| `subagent + codex` | bounded deliberation packet |
| MCP provider adapter | bounded deliberation packet |
| external model worker | bounded deliberation packet |

모든 realization은 synthesize 전에 같은 `deliberation.md` artifact를 생성한다.

---

## 9. Immediate Follow-up

다음 단계는 아래다.

1. provider별 controlled deliberation conformance harness를 확장한다
2. `learn` / `govern`의 MCP-native surface를 별도 설계한다
