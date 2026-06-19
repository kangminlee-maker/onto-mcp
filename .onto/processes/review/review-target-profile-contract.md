# Review Target Profile Contract

> Status: Active
> Purpose: Fix the review target's artifact role, closure level, and boundary obligation before lens dispatch.
> Scope: `review` only.

---

## 1. Position

`review-target-profile.yaml` is a runtime-owned execution-preparation artifact.

It answers a question that `target-snapshot.md` and `materialized-input.md` do
not answer:

```text
What kind of artifact is being reviewed, and what must this artifact be
responsible for closing inside the current review boundary?
```

This is not a new reasoning stage. The current v1 profile is deterministic and
heuristic. It exists so lens, issue-artifact, deliberation, and synthesize
stages evaluate the target against the same bounded target obligation.

---

## 2. Relation To Existing Artifacts

| Artifact | Role |
|---|---|
| `interpretation.yaml` | LLM-owned target and intent interpretation candidate. |
| `binding.yaml` | Runtime-owned resolved target refs, lens set, domain, and boundary. |
| `target-snapshot.md` | Preserved review-time target basis. |
| `materialized-input.md` | Execution-friendly normalized target input. |
| `review-target-profile.yaml` | Runtime-owned artifact role, target input kind, closure level, goals, and obligation policy. |
| `review-context-manifest.yaml` | Context admission, consumer allowlist, and packet provenance. |

`review-target-profile.yaml` does not replace any of the above. It is admitted
through `review-context-manifest.yaml` as an explicit context source.

---

## 3. Filesystem Seat

```text
{session_root}/execution-preparation/review-target-profile.yaml
```

`binding.yaml`, `execution-plan.yaml`, `target-snapshot-manifest.yaml`,
`review-run-manifest.yaml`, and `review-record.yaml` must preserve the profile
ref when the session reaches the corresponding phase. The profile ref is a
required runtime contract field; a canonical review session must not continue as
though the profile were optional.

---

## 4. Shape

```yaml
schema_version: "1"
session_id: "20260524-example"
created_at: "2026-05-24T12:00:00+09:00"
target_scope_kind: bundle
materialized_input_kind: bundle_member_texts
target_input_kind: explicit_bundle
target_material_kind: code
requested_target: package.json
review_intent_summary: "review implementation change"
artifact_roles:
  primary: computational_artifact
  secondary:
    - configuration_artifact
domain: software-engineering
maturity: review_candidate
closure_level: bounded_partial
review_goal:
  - correctness
  - verifiability
  - runtime_contract
closure_obligation_policy:
  - must_close_in_target
  - must_close_before_next_stage
  - may_close_during_next_stage
  - planned_later
  - out_of_scope
target_refs:
  - ref: /abs/project/package.json
    role: primary
    kind: file
    exists: true
    sha256: "..."
material_profile:
  target_material_kind: code
  target_material_kind_candidates:
    - code
  support_status: supported
  unsupported_reason: null
  detection:
    owner: runtime_heuristic
    confidence: 0.92
    confidence_basis: file name or extension indicates code/config material
boundary:
  filesystem_allowed_roots:
    - /abs/project
  source: binding
inference:
  owner: runtime_heuristic
  confidence: 0.8
  confidence_basis: explicit bundle target with primary/supporting refs
```

---

## 5. Target Input Kind

Allowed values:

| Value | Meaning |
|---|---|
| `single_file` | One file is the review target. |
| `directory` | A directory listing/content snapshot is the review target. |
| `explicit_bundle` | User or host supplied primary and supporting refs. |
| `git_diff` | Runtime materialized a git diff patch as the target basis. |
| `generated_packet` | Host supplied a generated review packet as the target basis. |

`git_diff` target refs must be materialized inside the active session root as
`{session_root}/diff-target.patch`. Creating the diff under a different review
session would break artifact truth and must fail review target profiling.

`generated_packet` is allowed for explicit packet review, but it is lower
confidence than `explicit_bundle` because the reviewed basis is a generated
representation rather than the original artifact set.

---

## 6. Target Material Kind Alignment

The current profile fixes how the target entered review, what artifact role it
carries, what material kind it appears to be, and what closure obligation
applies.

`target_material_kind` uses the shared values from
`.onto/authority/core-lexicon.yaml`:

```text
code | spreadsheet | document | database | mixed | unknown
```

The cross-process goal and completion conditions for this extension are defined
in `.onto/processes/shared/target-material-kind-contract.md`.

This axis must stay separate from:

- `domain`: what the target is about
- `target_input_kind`: how the target entered runtime
- `artifact_roles`: what responsibility the artifact carries
- `medium`: a cross-product reference and learning frame

The current runtime records material kind and detection confidence as a bounded
heuristic. Per-material review handling is implemented for **spreadsheet** through a
**single per-ref disposition** (`computeSpreadsheetDisposition`, the SSOT): every
spreadsheet honesty surface — `support_status`, `target_refs[].inspectable`/`.sha256`,
the `review_goal` obligations, the prompt `material_kind_obligations`, and the render
notes — **projects from one record computed once over the shared observation**, instead
of each surface re-deriving its claim from a different proxy. The structural inventory is
rendered into `materialized-input.md` with detail (formula text, named-range references,
data-validation rules incl. operator + formula bounds, protections, risk signals) —
**structure inspected only, not recalculated**.

Two distinct axes, deliberately not coupled:

- **`inspectable`** — the workbook was read (`unsupported_reason === null`) AND has
  renderable structure, *including plain tabular data* (columns / distinct-value vocab).
  A clean CSV or a formula-free data `.xlsx` is `inspectable` and stays
  `support_status: supported`. It is NOT coupled to whether any obligation is backed.
- **`backed_goals`** — the POSITIVE subset of the six obligations whose specific evidence
  exists in that ref's inventory; this drives `review_goal`. `review_goal` therefore
  carries **only the backed subset, not always all six**: a plain-data CSV backs none
  (and so carries no spreadsheet obligation while remaining `supported`); a macro-only or
  protection-only workbook backs only `access_and_protection_hygiene`. `structural_risk_signals`
  is backed by genuine structural risk only — `unreadable_sheet_part` (an observation-failure
  marker) and the `macro_present` / `external_links_present` signals (owned by other goals)
  do not back it.

`support_status` runs the gate over the **union of resolved and materialized** spreadsheet
refs the prompt renders — **regardless of the resolved material kind**, so a `code`-resolved
target carrying a materialized workbook the observer could not read degrades to `partial`
(it is not gated only when the resolved kind is spreadsheet). If **any** rendered spreadsheet
ref is uninspectable the target is `partial`, with a reason naming each uninspected ref by
its full resolved path and actual cause; obligations are dropped only when **no** ref is
inspectable. A `supported`/`null` profile is never emitted for a workbook the render shows as
`unsupported`. The render emits obligation-backing detail **before** the per-sheet bodies so
the prompt embed cut cannot strip an obligation's evidence, and protected/hidden sheets beyond
the render cap are disclosed by count. Observation bounds the number of sheets read
(`max_sheets_observed`, conservatively high) and a CSV/workbook whose decode or parse throws
degrades to an honest `unsupported` inventory rather than aborting review prep.

`code`, `document`, `database`, and `unknown` retain their prior support states
until their per-material review adapters land. A spreadsheet inside a `mixed`
bundle does not yet receive spreadsheet obligations (a known limitation,
consistent with the `mixed` support state).

---

## 7. Artifact Roles

Roles are role-based, not file-extension based:

```text
knowledge_artifact
decision_artifact
procedural_artifact
computational_artifact
record_artifact
contract_artifact
creative_artifact
presentation_artifact
data_artifact
configuration_artifact
```

The current runtime uses a deterministic heuristic from target input kind,
bundle kind, and file extension. The profile records `inference.confidence` and
`inference.confidence_basis` so downstream review can preserve uncertainty.

---

## 8. Closure Level And Obligation

Allowed closure levels:

| Value | Meaning |
|---|---|
| `bounded_closed` | The target is expected to close its own correctness inside the declared boundary. |
| `bounded_partial` | The target is bounded but may intentionally leave next-stage implementation or decision details open. |
| `open_partial` | The target is a partial representation or packet, so review must preserve representation limits. |

Issue classification may use:

```text
must_close_in_target
must_close_before_next_stage
may_close_during_next_stage
planned_later
out_of_scope
```

These values are distinct from severity, timing, and closure class.

---

## 9. Consumer Policy

The review target profile is admitted to:

- all selected lens consumers
- issue-artifact consumers
- per-lens deliberation consumers
- controlled deliberation
- synthesize
- final output and review record

The profile does not authorize new filesystem reads. It only classifies the
already bound target refs and the already declared filesystem boundary.

---

## 10. Binding Rules

Review target binding is fail-loud.

1. Runtime fixes `session_id` before target resolution.
2. `diffRange` materializes `diff-target.patch` under the same `session_id`
   that `binding.yaml`, `execution-plan.yaml`, and `review-target-profile.yaml`
   use.
3. `diffRange` must not be combined with explicit bundle fields.
4. If `targetScopeKind=file` or `targetScopeKind=directory` is provided, the
   resolved filesystem target must match that shape.
5. `primaryRef`, `memberRefs`, and `bundleKind` are explicit bundle inputs.
   They must not drift interpretation away from binding for a non-bundle review.
6. Every explicit bundle primary/supporting ref must exist and be inside the
   declared filesystem boundary before materialized input is rendered.
7. Project-external bundle refs require an explicit filesystem allowed root.
   Runtime must not silently read them because multi-artifact review depends on
   bounded context.
8. Target binding violations surface as structured MCP failures with
   `mcp_error_code=ONTO_REVIEW_TARGET_BINDING_FAILED`.

---

## 11. Verification Surface

The MCP review conformance suite must cover:

- `review-target-profile` artifact refs in MCP results and run manifests
- explicit bundle primary/supporting refs and hashes
- explicit target shape mismatch failure
- project-external bundle ref boundary failure
- `git_diff` target refs using the active session root
