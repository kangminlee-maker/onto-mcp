# Review Context Manifest Contract

> Status: Active
> Purpose: Keep review input grounding simple, explicit, and auditable without multiplying process stages.
> Gate authority: `.onto/processes/review/pre-dispatch-contracts.md`

---

## 1. Position

`review-context-manifest.yaml` is the consolidated pre-execution context contract for `review`.

It fixes the bounded context that may shape review judgment before lens dispatch:

- target profile: what artifact role and closure obligation apply
- domain knowledge: what factual/domain rules may be used
- alignment criteria: what purpose, values, and decision criteria may be used
- execution gates: what must be confirmed before review may start
- stage allowlist: which stage may consume which context source

This manifest is not a new reasoning stage. It is a small runtime-owned contract that prevents context drift and silent use of unstated criteria.

---

## 2. Relation To Existing Concepts

Nearest existing concept:

- `context-candidate-assembly`
- `review-target-profile`

Difference:

| Concept | Role |
|---|---|
| `context-candidate-assembly` | Candidate context set assembled before per-lens relevance judgment. |
| `review-target-profile` | Target artifact role, target input kind, closure level, review goals, and obligation policy. |
| `review-context-manifest` | Execution contract that fixes domain/alignment sources, stage allowlists, hashes, and confirmation gates for the review run. |

`review-context-manifest.yaml` may eventually absorb or constrain `context-candidate-assembly`, but it should not become a broad dumping ground for context.

---

## 3. Simplification Principle

Do not create separate runtime artifacts for every conceptual distinction unless a separate artifact provides a clear enforcement benefit.

Conceptually separate:

- target role and obligation
- domain knowledge
- alignment criteria
- lens role context
- deliberation context
- synthesis context

Implementation default:

- one manifest
- small schema
- hard gates
- explicit stage allowlists
- provenance requirements

The manifest exists to answer three questions:

1. What may be used as grounding?
2. Which stage may use it?
3. Was the user/principal confirmation required and satisfied?

---

## 4. Runtime Shape

Target path:

```text
{session_root}/execution-preparation/review-context-manifest.yaml
```

Canonical shape:

```yaml
schema_version: "1"
producer: onto-review-runtime
producer_version: "..."
settings_schema_version: settings.json/v1
domain_registry_version: domain-docs/v1
alignment_contract_version: review-value-alignment-criteria/v1
lifecycle_state: validated
session_id: "20260523-example"
target_refs: []
domain_binding_ref: "{session_root}/execution-preparation/domain-binding.yaml"
review_value_alignment_criteria_ref: "{session_root}/execution-preparation/review-value-alignment-criteria.yaml"
actor_consumer_bindings_ref: "{session_root}/execution-preparation/actor-consumer-bindings.yaml"
context_sources:
  - context_source_id: materialized-input
    source_kind: materialized_input
    source_ref: "{session_root}/execution-preparation/materialized-input.md"
    source_sha256: "..."
    required: true
    sensitivity: internal
    allowed_consumers:
      - lens:logic
      - synthesize
  - context_source_id: review-target-profile
    source_kind: review_target_profile
    source_ref: "{session_root}/execution-preparation/review-target-profile.yaml"
    source_sha256: "..."
    required: true
    sensitivity: internal
    allowed_consumers:
      - lens:logic
      - issue-artifact:problem-framing
      - controlled-deliberation
      - synthesize
derived_context_access_matrix:
  lens:logic:
    - materialized-input
  synthesize:
    - materialized-input
packet_refs: []
validation_results: []
failure_record_refs: []
```

After packet materialization, `packet_refs` is filled and lifecycle becomes
`dispatched`. The phase boundary is defined in
`.onto/processes/review/pre-dispatch-contracts.md §5`.

---

## 5. Target Profile Rules

Target profile context owns artifact role and closure obligation framing.

Rules:

1. Runtime materializes `review-target-profile.yaml` before manifest creation.
2. Runtime records target input kind, artifact roles, target refs, hashes, and
   filesystem boundary source.
3. The profile is admitted to all review consumers because it affects whether a
   discovered issue is inside the target's responsibility.
4. The profile does not grant permission to read outside `binding.yaml`
   boundary policy.
5. If a target was supplied as a generated packet, the profile must preserve
   `target_input_kind=generated_packet` so downstream review can preserve
   representation limits.

Allowed target input kinds and closure semantics are defined in
`.onto/processes/review/review-target-profile-contract.md`.

---

## 6. Domain Context Rules

Domain context owns factual and domain-specific review grounding.

Rules:

1. Runtime resolves the selected domain directory before lens dispatch.
2. Runtime records each included document with a stable path, role, stage allowlist, and hash.
3. Selected lens primary domain documents are required unless `session_domain` is `none`.
4. `problem_framing_profile.md` is `problem_framing_only` by default.
5. Round 1 lens packets must be rendered from the manifest, not from an unconstrained directory scan.
6. `synthesize` must not treat raw domain documents as a new independent source.

Stage defaults:

| Stage | Domain context access |
|---|---|
| `lens_round1` | Lens primary document and minimal supplementary documents allowed by manifest. |
| `issue_root_clustering` | Lens outputs and domain provenance only. Raw domain documents are not first-source inputs. |
| `deliberation_recheck` | Only issue-bounded cited refs or excerpts allowed. |
| `problem_framing` | `problem_framing_profile.md` allowed when present and valid. |
| `synthesize` | Lens provenance, deliberation result, and problem framing only. Raw domain documents not allowed. |

---

## 7. Alignment Context Rules

Alignment context owns purpose, values, stakeholder frame, non-goals, and decision criteria.

Alignment criteria can be inferred from main context, user request, and project authority docs, but they do not replace user intent.

Rules:

1. User/principal owns the final meaning of alignment criteria.
2. Runtime stores inferred alignment criteria with confidence and source class.
3. If confidence is not high, or if ambiguity has high review impact, review dispatch must stop for confirmation.
4. Review opening must show alignment criteria every time before dispatch.
5. `axiology` consumes alignment context as its primary grounding.
6. `synthesize` consumes axiology output and provenance, not raw alignment sources as independent authority.

Gate:

```text
if alignment_context.confirmation_required == true
and alignment_context.status != confirmed
then review dispatch must not start
```

Confidence-lowering conditions:

- user goal is inferred rather than explicit
- recent user request conflicts with project authority
- tradeoff terms are present but priority is unclear
- stakeholder or non-goal is inferred
- alignment criteria could materially change the review conclusion

---

## 8. Teamlead Role

The teamlead is a manifest-based dispatcher and context controller.

The teamlead does:

- present target, boundary, domain, alignment criteria, lens set, and execution settings
- present target profile, including artifact role and closure level
- enforce confirmation gates
- dispatch lenses and axiology with bounded context
- constrain deliberation context

The teamlead does not:

- pre-read domain documents to define findings
- replace axiology value judgment
- invent final conclusions
- resolve disagreements outside `deliberation.md`

---

## 9. Lens And Axiology Consumption

Core lenses consume domain context according to manifest stage allowlists.
All selected lenses consume the target profile as shared obligation framing.

`axiology` consumes alignment context and may use selected domain value commitments only when allowed by the manifest.

Every domain-grounded finding must preserve:

```markdown
### Domain Constraints Used
- source_doc: "..."
  source_version_or_snapshot_id: "..."
  anchor: "..."
```

Every axiology finding must preserve:

```text
value_authority_anchor
value_type
alignment_direction
```

If required grounding is absent, the finding must be limited to insufficient evidence rather than inventing a criterion.

---

## 10. Deliberation

Controlled deliberation is not a second full review.

Default deliberation shape:

```text
material-conflict issue
+ conflicting stances
+ target profile closure obligation
+ cited domain anchors
+ cited alignment anchors
+ bounded excerpts or refs
```

Each participating lens must state whether it:

- maintains
- narrows
- revises
- concedes

The teamlead records the issue result as:

- `no-deliberation-needed`
- `resolved`
- `narrowed`
- `unresolved-with-reason`

---

## 11. Synthesize Seat

`synthesize` is a separate non-lens review stage.

It is not the teamlead and not an independent lens.

Its role:

- read participating lens outputs
- read axiology output
- read review target profile
- read issue artifacts
- read controlled deliberation result
- read problem framing
- render the final review result conservatively

It must not:

- create new domain-grounded findings
- create new alignment criteria
- perform deliberation
- override unresolved disagreement

The teamlead controls process and deliberation. `synthesize` writes the final integrated review output from already bounded artifacts.

---

## 12. Opening And Final Output

Review opening must show:

- review target and boundary
- target profile, artifact role, and closure level
- selected domain and domain document status
- alignment criteria, confidence, and confirmation status
- lens set
- execution mode and model settings
- output artifact paths

Final output must show:

- final review result
- issue/root-cause clusters
- deliberation outcome
- problem framing classification
- target closure obligation classification
- domain evidence summary
- alignment evidence summary
- unresolved disagreement
- practical next step

---

## 13. Implementation Order

1. Add `review-context-manifest.yaml` materialization.
2. Populate target profile context from resolved target refs and binding boundary.
3. Populate domain context from resolved domain docs and selected lens set.
4. Populate alignment context from explicit request, main context summary, and project authority docs.
5. Add confirmation gate for low-confidence or high-impact alignment ambiguity.
6. Render opening brief from the manifest.
7. Render lens and axiology packets from the manifest.
8. Restrict synthesize raw context access.
9. Add final domain/alignment evidence summaries to `ReviewRecord` and human output.
