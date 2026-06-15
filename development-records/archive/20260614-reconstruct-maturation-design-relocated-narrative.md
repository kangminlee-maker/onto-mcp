# Reconstruct Maturation Design — Relocated Narrative (isolated)

> **Type**: archive / isolated historical narrative. NOT runtime authority.
> **Provenance**: relocated 2026-06-14 from
> `.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md` per concept-surface
> audit cleanup C1/C2 ([audit ledger](../audit/20260614-reconstruct-concept-surface-audit.md)).
> Reason: present-tense implementation-status and one-time "recomposition completion" narrative
> does not belong in an active rank-5 design contract (Documentation Hygiene; the contract's own
> §13/hygiene rules). Current implementation status authority is
> `reconstruct-contract-registry.yaml` + `IMPLEMENTATION_MAP.html`; current maturation completion
> criteria live in that contract's §16 "Maturation Completion Criteria" and seeding criteria in §5.1.
> This file is a point-in-time snapshot and is expected to go stale; do not cite it as current behavior.

---

## A. Implementation-status snapshot (relocated from §15)

> Snapshot of implementation status as of the 2026-06 recomposition. Stale-prone; the registry owns
> current status.

Current implementation has promoted seeding source-purpose authority,
pre-seed authoring readiness, compact selected-purpose prompt projection, direct
compact source-scout prompt projection for source-observation directive,
source-purpose, and candidate-inventory authoring, and the registry-backed
first-pass maturation authorities: baseline, baseline actionability matrix,
question frontier, closure frontier, answer support, answer claims, ontology
expansion, current actionability matrix, maturation source-delta, convergence,
continuation decision, and explicit proof-authority boundaries. Multi-round
source-observation delta and source-observation re-entry validation are active
for frontier-triggered observations before they re-enter prompt/context semantic
authoring or answer-support consumption. The optional `actionable-ontology.yaml`
projection is active for `actionable_limited` or `actionable_ready` continuation
states and is validated as a runtime projection of existing seed, expansion,
matrix, convergence, continuation, and proof boundary authorities.
Promoted same-request resume is active for authored artifacts only when reuse
provenance matches the current request, source/profile/domain
snapshot, source-safety/scout/lineage validation, and seed-authoring readiness
validation once those upstream authorities exist. Run-control resume rows record
the provenance match policy and check refs; semantic quality remains revalidated by
the downstream artifact validators.
`seed-authoring-readiness-validation.yaml` now also records
`deterministic_gate_scope: pre_seed_closure_only` and fails when the readiness
artifact omits the required boundary notes that keep deterministic closure
separate from semantic ontology adequacy. It also validates
`max_round_exhaustion_interpretation` so `max_round_exhausted` is not collapsed
into one generic state: a selected-purpose closure can remain
`sufficient_for_claim_scope`, while an exhausted open frontier projects
`insufficient_for_claim_scope` plus `exhausted_with_open_frontier`.
Ontology-domain category rows remain diagnostic unless the selected purpose
actually has a closure row for that category. They can expose modeling gaps, but
they must not block seed authoring just because a domain profile contains a
category that the selected source purpose did not require.
The first source frontier now has an actor-action-state scout policy: for
`round-1`, valid `SourceScoutPack` actor/action/state coverage gaps are sent as
inventory-only exploration candidates, and runtime may add up to three
unobserved code/document refs when the author returns an empty frontier. This
policy chooses exploration priority only; it does not create purpose elements or
ontology claims.
`source-scout-pack.yaml` remains a latest-current scout projection alias.
Pre-seed source-purpose, candidate-inventory, SeedAuthoringReadiness, and seed
reuse provenance consume immutable `source-scout-pack.pre-seed.yaml` and
`source-scout-pack-validation.pre-seed.yaml` snapshots. After maturation source
lineage refresh, runtime emits `source-scout-pack.post-maturation.yaml` and
`source-scout-pack-validation.post-maturation.yaml` so later audit surfaces can
distinguish the exact consumed snapshot from the latest-current alias.
The contract registry treats those validation snapshots as snapshot-scoped
active gate outputs, and the SeedAuthoringReadiness validator consumes the
pre-seed validation snapshot as its concrete source scout authority. Runtime
identity checks compare the validation artifact to its concrete sibling snapshot
ref, not only to `source-scout-pack.pre-seed.yaml` by basename, so copied
same-basename snapshots from another session do not satisfy the pre-seed
authority boundary.
Because the post-maturation snapshot is emitted after pre-handoff readiness,
`handoff-decision-validation.yaml` projects its gate as `not_applicable` during
the seed handoff. Runtime closes the later lifecycle boundary with
`post-maturation-gate-projection-validation.yaml`, which evaluates
`source_scout_pack_post_maturation_gate` from the post-maturation snapshot refs
before final-output and record consumption. That projection also requires the
post-maturation validation artifact and SourceScoutPack snapshot to be concrete
same-session siblings, not only same-phase basenames.
Prompt payloads now compact `exploration-synthesis.yaml` before source-frontier,
source-purpose, and candidate-inventory authoring. The projection preserves gap
ids, lens ids, descriptions, requested source refs, and evidence observation ids,
while omitting full `evidence_refs` objects to reduce prompt size without
changing artifact authority.
Mixed targets currently record `member_scoped_composite` scout scope as a
phase-1 limitation with no signal rows. This preserves member-scope truth
without claiming aggregate scout-enabled closure before a member-scoped scout
contract is promoted.
Seed authoring now has a focused repair loop: when the first
`ontology-seed.yaml` fails validation, runtime preserves the invalid seed and
validation sidecars as `ontology-seed-repair-1.input*.yaml`, asks the seed author
to revise only the validation-derived repair sections, rewrites
`ontology-seed.yaml`, and requires the repaired seed validation to pass before
downstream maturation consumes it.
Provider timeout recovery is staged and bounded. Source-purpose timeout retries
with a smaller LLM prompt that keeps the same `SourcePurposeCandidates` output
contract. Seed timeout first retries a smaller `OntologySeedMinimalKernel`
prompt; if that also times out, the run fails closed because runtime must not
author semantic ontology seed content. Claim realization and competency-question
authoring receive compact seed summaries and allowed-claim projections, and
competency-question timeout recovery may project deterministic coverage
questions from allowed claims and domain competency rows so downstream
validators can prove coverage or preserve limitations.

---

## B. One-time recomposition completion checklist (relocated from §16, seeding portion)

> The original §16 "Completion Definition For This Recomposition" seeding checklist. One-time
> recomposition framing; the per-stage criteria are in §15 stages and the consolidated seeding
> completion list is in §5.1. Preserved here for history only.

The recomposition is implemented when a fresh reconstruct run against a real
target produces:

1. `reconstruct-run-control.yaml` and validation proving session ownership,
   idempotency fingerprinting, active-attempt lock ownership, duplicate-start
   diagnostics, and observed file-hash write checkpoints, or a bootstrap
   diagnostic when run-control validation fails before trust can be established,
2. material-aware source observations,
3. source-purpose candidates, purpose candidate validation, and purpose
   confirmation validation when required,
4. candidate inventory and disposition with purpose-element and actionability
   surface mapping,
5. `ontology-seed.yaml` using the active seed contract,
6. source-derived purpose and purpose adequacy evidence closure,
7. user confirmation for inferred purpose when direct source purpose is absent,
8. deterministic validation artifacts for every gate,
9. canonical candidate-disposition, competency-question, assessment, and
   handoff-validation authorities, including diagnostic or claim-based P3
   competency-question disposition when ontology domain competency admission is present,
10. phase-scoped material admission rows and validation for pre-seed purpose
    elements, literal material-value rows, post-CQ domain competency rows, and
    maturation reassessment rows when each phase is applicable,
11. active source-frontier dependency validation, round source-observation
   delta/re-entry validation, and a validated session lineage index that
   preserves each newly observed source before answer-support consumption,
12. registry ref/hash plus active contract ref/hash, source profile migration,
   lens judgment, concrete gate-instance, validator, reference-standard,
   pattern-catalog URI/snapshot, and readiness-projection snapshots,
13. separate process-completion and seed-validity reporting,
14. final output that explains `OntologySeed` content, source-derived purpose,
    purpose adequacy frame, seed iteration readiness, maturation frontier, and
    limitations, and
15. a reconstruct record whose artifact refs are the source of truth,
16. claim projection rows and validation for status/result/MCP/API surfaces when
    those surfaces claim readiness, actionability, or material-kind support,
    citing `target-material-profile-validation.yaml` and the immutable
    pre-publication run-control checkpoint, and final-output claim sections that
    cite the canonical refs without restating pre-publication claim values,
17. source-safety authority rows and validations when observed source lifecycle,
    redaction, privacy, or authorization affects prompt/context use, plus planned
    mutable-vocabulary authority rows after registry promotion when external
    standards, provider/framework terms, or profile-owned facets affect a
    material claim,
    and
18. registry-verification evidence for any present-tense active, promoted,
    current, implemented, or executable claim.
