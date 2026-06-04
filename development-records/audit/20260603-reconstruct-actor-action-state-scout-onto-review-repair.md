# 2026-06-03 Reconstruct Actor-Action-State Scout Onto Review Repair

> Reviewed design:
> `development-records/plans/20260603-reconstruct-actor-action-state-scout-design.md`
> Initial onto review session:
> `.onto/review/20260603-e400b6ac`
> Initial material issue count: 7
> First re-review session:
> `.onto/review/20260603-1eaca965`
> First re-review material issue count: 2
> Final re-review before category repair:
> `.onto/review/20260603-3d403752`
> Final re-review material issue count before category repair: 1
> Zero-material re-review session:
> `.onto/review/20260603-f71217ae`
> Zero-material re-review material issue count: 0
> Repair status: design-contract scope closed; runtime implementation evidence remains follow-up

## Initial Onto Review Result

The full onto review completed with 9/9 lenses, controlled deliberation, and no
degraded lenses. It found 7 material issues:

| Issue | Severity | Repair applied |
|---|---|---|
| issue-001 | high | Added mandatory source-safety, visibility/redaction, intended-consumption, proof/replay, and lineage refs for every prompt-visible scout row. Added fail-closed pack validation before prompt materialization. |
| issue-002 | high | Replaced aggregate readiness with `closure_rows[]` keyed to selected `PurposeAdequacyFrame.required_elements[]`; added explicit input authority refs and fail-closed validation-gap behavior. |
| issue-003 | high | Scoped Phase 1 to single-member `code` and `document`; mixed/spreadsheet/database/unknown are not scout-enabled unless a later member-scoped contract is promoted. |
| issue-004 | medium | Extended stale reuse compatibility to source-scout-pack hash/validation, projector/ranking/closure versions, source-safety validation, material-profile validation, observation lineage validations, and readiness taxonomy. |
| issue-005 | medium | Separated `scout_focus: actor_action_state` from selected-purpose actionability readiness; readiness now follows selected source profile and purpose adequacy required elements. |
| issue-006 | medium | Replaced flat readiness states with orthogonal taxonomy fields for classification, missing categories, frontier availability, source sufficiency, budget, limitation state, validation gap, enum owner, and aliases. |
| issue-007 | medium | Removed `authority` from `signal_axis`; replaced it with observational cues such as `declared_purpose`, `source_claim`, `instruction_cue`, and `provenance_cue`. |

## Repair Summary

The repair keeps Option B but narrows it:

- `SourceScoutPack` is a source-safety-filtered runtime projection, not a
  prompt-visible shortcut around source governance.
- `SeedAuthoringReadiness` is a validated selected-purpose closure projection,
  not an aggregate actor/action/state completeness score.
- Phase 1 is intentionally limited to single-member `code` and `document`
  targets.
- Mixed support requires member ids, selected profile snapshot refs, support
  states, cross-material refs, limitation/frontier lineage, source-safety refs,
  and strictest-member aggregate projection.
- Stale reuse includes deterministic projection identity, ranking identity,
  safety validation identity, lineage identity, readiness taxonomy, and closure
  rule versions.

## Re-Review Criteria

The re-review should verify that:

1. Prompt-visible scout rows cannot bypass source safety.
2. Readiness closure is auditable per selected required element.
3. Phase 1 cannot overclaim mixed target support.
4. Stale reuse includes scout and readiness projection identities.
5. Actor/action/state remains a scout focus, not a universal readiness gate.
6. Readiness taxonomy separates classification, missing category, frontier,
   source sufficiency, budget, limitation, and validation gap.
7. Scout vocabulary no longer uses authority as a signal axis.

## First Re-Review Result

The first re-review accepted the seven original repairs in broad shape but found
2 remaining material issues:

| Issue | Severity | Repair applied |
|---|---|---|
| issue-001 | high | Removed selected-purpose required-element refs from the upstream `SourceScoutPack`. The pack now records profile-local scout coverage only; selected-purpose closure starts in `SeedAuthoringReadiness.closure_rows[]` after source-purpose candidates and purpose adequacy frame validation. Added ontology-domain required category rows to readiness validation. |
| issue-002 | medium | Declared `target-material-profile-validation.yaml` as the canonical material-support seat and `source-scout-pack-validation.yaml#scout_scope` as the derived scout-scope projection. Removed independent material-scope readiness states; `closure_state: unsupported` remains row-local only. |

Second repair verification focus:

1. Initial scout pack validates before `PurposeAdequacyFrame.required_elements[]`
   exists and contains no selected-purpose required-element refs.
2. Readiness proves ontology-domain required categories or validated
   limitation/frontier/validation-gap rows before `seed_ready`.
3. Material support is owned by one canonical seat and readiness/public labels
   derive from it.

## Final Re-Review Result

The final re-review accepted the second repair for upstream scout ordering,
selected-purpose closure location, and canonical material-scope support. It
found 1 remaining material issue:

| Issue | Severity | Repair applied |
|---|---|---|
| issue-001 | medium | Extended ontology-domain required category closure so `classification consistency` and `application context` are explicit minimum categories before `seed_ready`, unless an explicit validated equivalence mapping closes them. Updated the verification plan to block `seed_ready` when either category is absent without validated limitation, frontier, or validation-gap rows. |

Non-material findings carried forward:

- The current bundle proves design-contract closure only; executable runtime,
  API, MCP, manifest, and record projections still require implementation and
  validation before runtime completion can be claimed.
- If readiness category rows become cross-domain later, promote the surface from
  `ontology_domain_required_category_rows` to a domain-neutral row set with
  `domain_id` and `category_source_ref`.

## Zero-Material Re-Review Result

The zero-material re-review completed with 9/9 lenses, controlled deliberation,
no degraded lenses, and material issue count 0:

| Session | Highest severity | Material issues | Conclusion |
|---|---:|---:|---|
| `.onto/review/20260603-f71217ae` | info | 0 | Category repair closes the prior material design-contract issues within the bounded review target. |

Preserved limitation:

- This is a design-contract pass. Runtime validators, API/MCP projections,
  manifest refs, record refs, and tests must still be implemented and reviewed
  before product runtime completion is claimed.
