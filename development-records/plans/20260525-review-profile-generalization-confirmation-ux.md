# Review Profile Generalization And Confirmation UX Plan

> Status: Draft plan
> Created: 2026-05-25
> Source review session: `.onto/review/20260525-f6a9c762`
> Scope: Review profile generalization and explicit profile override / confirmation UX.

---

## 1. Review Result Disposition

The latest implementation review completed with all 9 lenses, controlled
deliberation, and synthesize:

- Target: `8f7ca63` target binding / `review-target-profile` implementation
- Domain: `software-engineering`
- Result: completed, deliberation performed, 7 issues
- Important local discovery before dispatch: Codex OAuth settings normalize to
  `provider=codex`, so the Codex worker route preflight must accept
  `auth=oauth + provider=codex`.

Issue disposition:

| Issue | Disposition | Reason |
|---|---|---|
| `issue-001` ReviewTargetProfile authority chain | Implementation backlog | Needs core lexicon / artifact-seat authority closure before treating the profile as fully canonical. |
| `issue-002` manifest example under-admits consumers | Doc cleanup | Active rule is clear enough; example should be corrected during contract cleanup. |
| `issue-003` git_diff identity over-matches nested `diff-target.patch` | Implementation backlog | Exact artifact-seat equality should replace basename + containment matching. |
| `issue-004` closure obligation tokens are duplicated | Implementation backlog | Token vocabulary needs one executable authority shared by types, validators, prompts, and tests. |
| `issue-005` generated_packet / directory evidence gap | Review profile design input | This belongs in generalized target profile and profile confirmation design. |
| `issue-006` MCP target option contract ambiguity | Confirmation UX and API design input | User-facing target contract must define valid combinations and failure behavior. |
| `issue-007` heuristic role inference can become over-authoritative | Confirmation UX design input | Runtime heuristics should remain advisory unless confirmed, overridden, or domain-rule backed. |

This document addresses `issue-005`, `issue-006`, and `issue-007`.
`issue-001`, `issue-003`, and `issue-004` should be closed as implementation
backlog before the review profile design is productized.

---

## 2. Concept Boundaries

Nearest existing concepts:

| Concept | Current role |
|---|---|
| `ReviewTargetProfile` | Runtime artifact for one review session's target kind, artifact role, closure level, goals, refs, hashes, and boundary. |
| `problem_framing_profile.md` | Domain-specific classification axes used after issue clustering. |
| `ReviewValueAlignmentCriteria` | Purpose, values, non-goals, and judgment criteria for the review. |
| `review-context-manifest.yaml` | Context-source admission and packet provenance. |

The proposed **Review Profile** should not replace these. It should be a
composition layer that explains how a review should be framed for a target
category, domain, and purpose.

Working definition:

```text
ReviewProfile =
  target profile candidate
  + domain-specific profile rules
  + alignment criteria
  + confidence / confirmation policy
```

`ReviewTargetProfile` remains the session artifact. `ReviewProfile` is a future
configuration / derivation model that helps create or confirm it.

---

## 3. Generalized Review Profile Dimensions

A generalized review profile should be domain-aware but not software-only.

Common dimensions:

| Dimension | Meaning | Example values |
|---|---|---|
| `artifact_family` | Broad kind of artifact being reviewed. | computational, data, financial_workbook, narrative, record, contract, presentation, decision, procedure |
| `artifact_role` | Runtime role used by `ReviewTargetProfile`. | computational_artifact, data_artifact, creative_artifact, record_artifact |
| `closure_model` | What the artifact is responsible for closing. | self-contained, bounded_partial, evidence_packet, iterative_draft |
| `evidence_model` | What counts as evidence. | executable tests, formula trace, source documents, narrative continuity, signed records |
| `review_goal_profile` | Default review goals. | correctness, completeness, lineage, coherence, compliance, stakeholder_fit |
| `domain_overlay` | Domain-specific axes and obligations. | software defect kind, accounting assertion, narrative continuity axis |
| `confirmation_policy` | When user confirmation is required. | low confidence, high impact, ambiguous role, generated packet |

Example domain mappings:

| Domain / artifact | Profile emphasis |
|---|---|
| Software implementation diff | Runtime contract, tests, boundary safety, regression risk, maintainability. |
| Spreadsheet accounting workbook | Formula integrity, source lineage, reconciliation, control risk, audit trail. |
| Narrative document / novel draft | Continuity, voice, pacing, character intent, reader experience, internal coherence. |
| Operational incident record | Timeline completeness, evidence preservation, causal chain, decision auditability. |
| Strategy / decision memo | Assumptions, tradeoffs, stakeholder values, reversibility, decision criteria. |

---

## 4. Profile Derivation Path

The future runtime should derive and lock a profile in bounded phases:

```text
MCP input / host request
  -> target binding
  -> ReviewTargetProfile candidate
  -> domain profile overlay
  -> alignment criteria overlay
  -> profile confidence assessment
  -> user confirmation or structured block
  -> review-context-manifest admission
  -> lens dispatch
```

Authority split:

| Step | Owner | Notes |
|---|---|---|
| target refs / filesystem boundary | runtime | Must remain fail-loud and hash-grounded. |
| initial artifact role heuristic | runtime | Advisory unless confidence is high and no confirmation trigger fires. |
| domain overlay | domain docs | Domain docs can add profile rules but must not silently override target refs. |
| alignment criteria | user / main context | High-impact ambiguity requires user confirmation. |
| confirmation decision | user or explicit MCP caller | Confirmation must be recorded in artifacts. |
| final profile truth | runtime artifact | `review-target-profile.yaml` remains the session truth. |

---

## 5. Confirmation Triggers

The runtime should require confirmation before dispatch when any of these are
true:

1. `inference.confidence` is below the configured threshold.
2. `target_input_kind=generated_packet`.
3. The target is a directory and the sampled evidence is truncated.
4. The artifact role is inferred from weak extension or filename evidence.
5. Domain rules disagree with runtime heuristics.
6. The selected closure level implies `must_close_in_target` or
   `must_close_before_next_stage` for a high-impact domain.
7. User-supplied intent implies a different review goal than the inferred target
   profile.
8. The target contains mixed artifact families, such as code + policy + data.
9. The target is outside the project root but explicitly allowed.

Default confidence thresholds:

| State | Suggested behavior |
|---|---|
| `confidence >= 0.85` and no trigger | Allow dispatch, record heuristic source. |
| `0.65 <= confidence < 0.85` | Show profile preview; require confirmation for high-impact domains or mixed artifacts. |
| `confidence < 0.65` | Block dispatch until user confirms or overrides. |

---

## 6. Explicit Override UX

Future MCP input should allow explicit profile override, but only as a typed,
recorded contract.

Candidate shape:

```json
{
  "profileOverride": {
    "artifactRoles": {
      "primary": "financial_workbook",
      "secondary": ["record_artifact"]
    },
    "closureLevel": "bounded_closed",
    "reviewGoals": ["formula_integrity", "source_lineage", "reconciliation"],
    "overrideReason": "The workbook is the authoritative month-end close packet."
  },
  "confirmTargetProfile": true
}
```

Rules:

1. Override values must be validated against canonical token sets.
2. Override cannot change target refs or filesystem boundary.
3. Override cannot downgrade required domain safety gates.
4. Override must record `confirmed_by`, `confirmed_at`, `source`, and
   `override_reason`.
5. Invalid override returns a structured failure before manifest creation.
6. Valid override changes profile source from `runtime_heuristic` to
   `user_override` or `user_confirmed`.

Suggested structured failure codes:

| Failure | Meaning |
|---|---|
| `ONTO_REVIEW_PROFILE_CONFIRMATION_REQUIRED` | Profile is plausible but requires user confirmation before dispatch. |
| `ONTO_REVIEW_PROFILE_OVERRIDE_INVALID` | User override contains invalid tokens or forbidden changes. |
| `ONTO_REVIEW_PROFILE_DOMAIN_CONFLICT` | Domain profile rules conflict with requested override. |

---

## 7. Start Preview Requirements

Before review dispatch, the principal-facing preview should include:

- target refs and filesystem boundary
- selected domain and domain profile status
- alignment criteria summary and confidence
- target input kind
- artifact role candidate
- closure level candidate
- review goal candidate
- profile confidence and confidence basis
- whether the profile is heuristic, domain-rule backed, user confirmed, or user
  overridden
- exact place to change settings or MCP arguments

Preview states:

| State | Dispatch |
|---|---|
| `profile_auto_admitted` | allowed |
| `profile_confirmation_required` | blocked until confirmation |
| `profile_override_applied` | allowed if override validates |
| `profile_override_rejected` | blocked |
| `profile_domain_conflict` | blocked until user changes domain/profile/target |

---

## 8. Productization Sequence

Recommended next implementation order:

1. Close review-raised implementation backlog:
   - add `ReviewTargetProfile` concept authority
   - exact `git_diff` artifact-seat identity
   - central `ReviewClosureObligation` token source
   - clarify MCP target option combinations
2. Add directory and generated-packet conformance fixtures.
3. Add profile confidence threshold and confirmation-required structured
   failure.
4. Add explicit `confirmTargetProfile` and `profileOverride` MCP input.
5. Add domain-specific profile rule loading.
6. Update opening brief and final result presentation with profile source and
   confirmation state.

---

## 9. Non-Goals For This Plan

- Do not make heuristics LLM-owned.
- Do not let profile override mutate target refs.
- Do not make domain docs replace target binding.
- Do not add resume behavior as part of confirmation.
- Do not generalize learn/govern here; learn/govern remains a later design
  after review/reconstruct/evolve stabilize.
