# Review Final Output Lens Position Summary Design

> Status: Implemented in current runtime path
> Date: 2026-06-08
> Scope: review `synthesis-ledger.yaml` runtime projection and `final-output.md` rendering
> Invariant check: touched `INV-SCHEMA-1` because it changes a pipeline output contract. Implemented after explicit user approval.

## 1. Goal

The final review output should show, for each material issue:

1. how many lenses agreed with the issue stance,
2. which lenses agreed,
3. how many lenses disagreed or remained unresolved,
4. which lenses disagreed,
5. which lenses originally raised the issue,
6. which deliberation participants accepted the final resolution.

The purpose is human auditability. A principal reading `final-output.md` should
not need to inspect YAML artifacts to know whether an issue was broadly
supported, narrowly accepted, or still contested.

## 2. Current Gap

The required data exists upstream, but does not reach `final-output.md` in a
usable shape.

| Data | Current source | Current downstream state |
|---|---|---|
| Issue stance by lens | `issue-stance-matrix.yaml` | Used in synthesis work item input, not rendered in final output |
| Lenses that raised the issue | `issue-ledger.yaml.issues[].raised_by_lens_ids` | Preserved as `synthesis-ledger.material_issues[].source_lens_ids` |
| Resolution accepted lenses | `deliberation-resolution.yaml.issues[].accepted_by_lens_ids` | Present in `synthesis-work-items.yaml`, dropped during `synthesis-ledger.yaml` assembly |
| Remaining disagreement lenses | `deliberation-resolution.yaml.issues[].remaining_disagreement_lens_ids` | Present in `synthesis-work-items.yaml`, dropped during `synthesis-ledger.yaml` assembly |
| Unresolved disagreement prose | issue synthesis response | Preserved as `synthesis-ledger.material_issues[].unresolved_disagreement_note` |

`render-review-final-output.ts` currently reads `synthesis-ledger.yaml`,
`execution-result.yaml`, and result classification projections. It does not read
`deliberation-resolution.yaml` directly for per-issue lens position details.

## 3. Meaning Boundary

Do not collapse all lens-position facts under a single "agreement" concept.
There are two different concepts:

| Concept | Meaning | Source authority |
|---|---|---|
| Issue stance position | Whether a lens supports, narrows, opposes, replaces, treats as surface-only, or lacks evidence for the issue/root/action/severity | `issue-stance-matrix.yaml` |
| Resolution acceptance | Whether a deliberation participant accepted the final controlled-deliberation resolution | `deliberation-resolution.yaml` |

Final output should display both.

Recommended labels:

- `Issue stance agreement`
- `Issue stance disagreement`
- `Resolution accepted by`
- `Remaining disagreement`
- `Raised by lenses`

Avoid saying "the lens agreed with the issue" when the data actually means
"the lens accepted the final resolution after deliberation."

## 4. Canonical Projection

Add a runtime-owned projection to each
`synthesis-ledger.yaml.material_issues[]` entry.

```yaml
lens_position_summary:
  issue_stance_lens_count: 9
  raised_by_lens_ids: [logic, structure, semantics]
  stance_buckets:
    support: [logic, axiology]
    narrow: [structure, semantics]
    oppose: []
    alternative_root: []
    surface_only: []
    not_applicable: [conciseness]
    insufficient_evidence: [coverage]
  resolution_acceptance:
    deliberation_participating_lens_ids: [logic, structure, semantics, axiology]
    accepted_by_lens_ids: [logic, structure, semantics, axiology]
    remaining_disagreement_lens_ids: []
```

Ownership:

- Runtime owns the projection field and all arrays inside it.
- LLM does not submit or edit this field.
- The projection is derived from existing artifact truth:
  - `workItem.stance_summary[]`
  - `workItem.raised_by_lens_ids`
  - `workItem.deliberation_resolution.accepted_by_lens_ids`
  - `workItem.deliberation_resolution.remaining_disagreement_lens_ids`

## 5. Final Output Rendering

For each material issue, render the lens position summary before explanatory
prose.

Example:

```md
Lens stance agreement: 4 / 9
Agreed or narrowed lenses: logic, axiology, structure, semantics
Disagreeing stance lenses: none
Not applicable: conciseness
Insufficient evidence: coverage

Resolution accepted by: 4 / 4 deliberation participants
Accepted lenses: logic, structure, semantics, axiology
Remaining disagreement: none
Raised by lenses: logic, structure, semantics
```

Rendering rules:

1. `support` and `narrow` count as issue stance agreement for the compact count.
2. `oppose`, `alternative_root`, and `surface_only` count as issue stance disagreement.
3. `not_applicable` and `insufficient_evidence` are shown separately and do not count as agreement or disagreement.
4. `resolution_acceptance.accepted_by_lens_ids` is rendered separately from issue stance agreement.
5. If a list is empty, render `none`.
6. Do not infer missing stances in the renderer. Missing stance coverage should have failed earlier.

## 6. Implementation Plan

### Step 1. Contract update

Update the synthesize contract to declare `lens_position_summary` as a
runtime-owned `synthesis-ledger.yaml` projection.

Affected active docs:

- `.onto/processes/review/synthesize-prompt-contract.md`
- `.onto/processes/review/record-field-mapping.md` if ReviewRecord summary also references this field
- `.onto/processes/review/record-contract.md` only if ReviewRecord receives a new per-issue projection

Do not add a new LLM submit field.

### Step 2. Type update

Add a type such as:

```ts
export interface ReviewSynthesisLensPositionSummary {
  issue_stance_lens_count: number;
  raised_by_lens_ids: string[];
  stance_buckets: {
    support: string[];
    narrow: string[];
    oppose: string[];
    alternative_root: string[];
    surface_only: string[];
    not_applicable: string[];
    insufficient_evidence: string[];
  };
  resolution_acceptance: {
    deliberation_participating_lens_ids: string[];
    accepted_by_lens_ids: string[];
    remaining_disagreement_lens_ids: string[];
  };
}
```

Then add it to `ReviewSynthesisLedgerMaterialIssue`.

Primary code location:

- `src/core-runtime/review/synthesis-map-reduce.ts`

### Step 3. Runtime projection

During synthesis ledger assembly, build `lens_position_summary` from the
material issue work item.

Source mapping:

| Target field | Source |
|---|---|
| `issue_stance_lens_count` | `workItem.stance_summary.length` |
| `raised_by_lens_ids` | `workItem.raised_by_lens_ids` |
| `stance_buckets.*` | group `workItem.stance_summary[]` by `stance` |
| `deliberation_participating_lens_ids` | union of accepted and remaining disagreement ids, or deliberation-plan participant ids if already present in work item |
| `accepted_by_lens_ids` | `workItem.deliberation_resolution.accepted_by_lens_ids` |
| `remaining_disagreement_lens_ids` | `workItem.deliberation_resolution.remaining_disagreement_lens_ids` |

Design note: `deliberation_participating_lens_ids` is the only field that may
need an explicit source check. If the work item does not carry the participant
set, implementation should derive it from accepted plus remaining disagreement
only when that is contractually sufficient, or extend the work item with a
runtime-owned participant list from `deliberation-plan.yaml`.

### Step 4. Renderer update

Update `render-review-final-output.ts` so material issue rendering includes:

- issue stance agreement count/list,
- issue stance disagreement count/list,
- not applicable list,
- insufficient evidence list,
- resolution acceptance count/list,
- remaining disagreement count/list,
- raised-by list.

The renderer should read only `synthesis-ledger.yaml`; it should not reopen
`issue-stance-matrix.yaml` or `deliberation-resolution.yaml` for this display.

### Step 5. Tests

Add tests covering:

1. `synthesis-ledger.yaml` preserves `lens_position_summary`.
2. stance bucket projection is deterministic and does not rewrite stance semantics.
3. final output renders agreement and disagreement counts/lists.
4. empty lists render as `none`.
5. unsupported stance token fails before final rendering.
6. old/missing `lens_position_summary` fails loudly once the contract is updated.

Likely files:

- `src/core-runtime/review/synthesis-map-reduce.test.ts`
- `src/core-runtime/cli/render-review-final-output.test.ts`

## 7. Schema Version Decision

This change alters the durable `synthesis-ledger.yaml` material issue contract.
The implemented path keeps `schema_version: 1` and makes
`lens_position_summary` required for material issue rows in the active runtime
contract.

Given the project preference against backward-compatibility aliases/fallbacks,
the renderer does not support both old and new shapes. It fails loudly when a
material issue row lacks `lens_position_summary`.

## 8. Completion Criteria

The change is complete when:

1. `synthesis-ledger.yaml.material_issues[]` contains runtime-derived `lens_position_summary`.
2. `final-output.md` shows issue stance agreement/disagreement and resolution acceptance/disagreement per material issue.
3. The renderer does not need to re-read upstream raw stance or deliberation artifacts.
4. Tests prove projection and rendering with support, narrow, oppose,
   alternative_root, surface_only, not_applicable, and insufficient_evidence.
5. Existing semantic meaning is unchanged: material issue definition, severity, and deliberation result are not reinterpreted.

## 9. Self Review

### Finding 1 — Material

Issue: The word "agreement" is ambiguous.

Risk: If final output uses only `accepted_by_lens_ids`, it may imply that a lens
agreed with the original issue when it only accepted the final narrowed
resolution. That would mislead the principal.

Design response: Split output into issue stance position and resolution
acceptance. Use `issue-stance-matrix.yaml` for stance and
`deliberation-resolution.yaml` for final resolution acceptance.

### Finding 2 — Material

Issue: The current renderer cannot reliably access the needed data.

Risk: Reading `deliberation-resolution.yaml` directly inside final rendering
would bypass the synthesize ledger as source layer and create another artifact
join point late in the pipeline.

Design response: Add `lens_position_summary` to `synthesis-ledger.yaml` as a
runtime-owned projection. The renderer reads the ledger only.

### Finding 3 — Medium

Issue: `deliberation_participating_lens_ids` may not be explicitly preserved in
the synthesis work item.

Risk: Deriving participant count from accepted plus remaining disagreement can
be wrong if the resolution status has no remaining disagreement but still needs
the original participant denominator.

Design response: Implemented by extending the runtime work item projection with
`deliberation_participating_lens_ids`, derived from `deliberation-plan.yaml`
when the issue is planned. If no planned row exists, runtime derives a bounded
fallback from accepted plus remaining disagreement lens ids.

### Finding 4 — Low

Issue: The schema version policy is not yet decided.

Risk: Keeping `schema_version: 1` while adding required fields can make old and
new artifacts indistinguishable.

Design response: Chose one fail-loud path: keep `schema_version: 1`, require
`lens_position_summary`, and reject/malformed old material issue rows in final
output rendering.

### Self-review conclusion

No blocker remains. Material findings 1 and 2 are addressed by the
runtime-owned projection. Medium finding 3 and the schema-version decision have
been reflected in implementation and targeted tests.
