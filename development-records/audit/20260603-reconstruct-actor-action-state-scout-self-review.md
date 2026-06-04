# 2026-06-03 Reconstruct Actor-Action-State Scout Self-Review

> Reviewed artifact:
> `development-records/plans/20260603-reconstruct-actor-action-state-scout-design.md`
> Self-review material issue count before onto review: 0
> Superseded by onto review session `.onto/review/20260603-e400b6ac`,
> which found 7 material issues and triggered
> `development-records/audit/20260603-reconstruct-actor-action-state-scout-onto-review-repair.md`.

## Review Criteria

The review used the following materiality criteria:

1. LLM/runtime boundary is preserved.
2. Existing reconstruct concepts are reused or extended before adding concepts.
3. New artifacts have a clear authority seat, validation path, and promotion
   path into runtime truth.
4. Source profile extensions comply with `source-profile-contract.md` and do
   not decide semantic importance.
5. Max-round exhaustion is separated from source insufficiency.
6. Actor/action/state priority improves first exploration without hiding static
   or non-actor source truth.
7. Verification plan can catch boundary drift, stale reuse, and pack omission.

## Review Round 1

Material findings found: 3.

| ID | Finding | Materiality | Resolution |
|---|---|---|---|
| M1 | The first draft used `candidate_triads` inside `SourceScoutPack`, which let runtime grouping look like an actor/action/state semantic claim. | Runtime could appear to decide who acts on what and what state changes. | Replaced `candidate_triads` with non-semantic `scout_groups` that record deterministic co-location only. Added explicit note that runtime scout groups are not ontology claims. |
| M2 | Pre-seed readiness and post-seed handoff readiness were conflated. | A post-seed validation concept could accidentally block/allow seed authoring before a seed exists. | Added `SeedAuthoringReadiness` as a distinct pre-seed projection with `seed-authoring-readiness.yaml` and validation artifact. Kept post-seed handoff validation separate. |
| M3 | Source profile guidance changes did not explicitly require registry hash updates. | Active source profile records would become stale if `code.md` or `document.md` changed without `definition_sha256` updates. | Added Phase 1 and static-check requirements that `reconstruct-contract-registry.yaml#source_profile_records` hashes update in the same change. |

Round 1 result: material issue count after fixes was not yet 0 because new
artifact promotion and ranking/omission semantics needed a second pass.

## Review Round 2

Material findings found: 2.

| ID | Finding | Materiality | Resolution |
|---|---|---|---|
| M4 | New artifacts were named but the promotion path into stage ids, artifact authority catalog, validation gate catalog, run manifest refs, record refs, and API/MCP projections was not explicit. | `SourceScoutPack` or `SeedAuthoringReadiness` could become untracked side artifacts instead of reconstruct runtime truth. | Added a promotion checklist covering `RECONSTRUCT_STAGE_IDS`, registry authority/validation refs, run manifest, record refs, API/MCP projections, and claim-projection coverage. |
| M5 | `high-signal` omission checks could be read as deterministic semantic importance. | Runtime could smuggle semantic prioritization into a pack omission gate. | Added deterministic source-candidate ranking constraints: profile signal-axis match count, support state, concrete source pattern, co-location basis, and source safety/replay eligibility only. Required `ranking_basis` and `ranking_version`; clarified that rank means inspect earlier, not semantic truth. |

Round 2 result: material issue count after fixes was 0.

## Review Round 3

Material findings found: 0.

Checks:

- LLM-owned interpretation remains in `SourceObservationDirective`,
  `SourcePurposeCandidates`, `PurposeAdequacyFrame`, `CandidateInventory`,
  `CandidateDisposition`, and `OntologySeed`.
- Runtime-owned gates validate traceability, deterministic grouping, closure,
  reuse compatibility, and public claim provenance only.
- Source profiles remain material-kind reading guidance and do not promote
  source structure into ontology concepts.
- Max-round exhaustion remains separate from source insufficiency; budget
  exhaustion can yield limited seed, frontier-required, or blocked states.
- New concept surface is limited to `SourceScoutPack` and
  `SeedAuthoringReadiness`, both justified by runtime authority and replay
  needs.

Self-review conclusion: no material design issue remained under the local
self-review criteria before implementation planning. This conclusion was later
superseded by the full onto review noted above.

## Post-Review Terminology Alignment

After verification, the design document was aligned with current runtime naming:
post-seed readiness is described through existing `HandoffDecisionValidation`
and `handoff-decision-validation.yaml`, not a separate seed-iteration readiness
concept. This was a terminology correction, not a new material issue, because
the design already kept pre-seed
`SeedAuthoringReadiness` separate from post-seed handoff validation.
