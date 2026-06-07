---
as_of: 2026-06-07
status: decision-support
purpose: compare the LLM output-enforcement approaches and record the field-level hybrid control strategy for the review pipeline
owner: review runtime tuning
scope: src/core-runtime/review, src/core-runtime/cli (structured-output-tools, executors), src/core-runtime/llm
source_session: 019e92b5-9c9a-7690-ab53-9dc82c5df651 (Codex, 2026-06-04..06-07)
related_plan: development-records/plans/20260605-review-artifact-pipeline-efficiency-work.md
related_work_order: development-records/plans/20260607-review-pipeline-remaining-work-order.md
---

# Output Enforcement Strategy: Two Approaches and the Hybrid Judgment

## Purpose

This document does two things. First, it summarizes the structural strategies
for forcing an LLM unit to emit a contract-complete artifact. Second, it records
the 2026-06-07 design judgment: the review pipeline should remain a field-level
hybrid. The goal is not to force every field into provider strict schema, and
not to leave every semantic surface as free text. The goal is to assign the
weakest mechanism that is still strong enough for each field.

Terms are used as-is and then explained in plain language, because the audience
includes non-implementers.

- **Constrained decoding** — the provider blocks invalid next-tokens at
  generation time, so an out-of-schema value is never produced. Enforcement is
  at decode time.
- **Post-hoc validation** — the runtime checks the produced output after the
  fact and rejects it on failure, then retries. Enforcement is after generation.
- **Provider strict schema** — the runtime gives the provider a JSON schema
  before generation. Short closed values such as enums can become ungenerable
  when the provider honors the schema.
- **Runtime allowed-set validation** — the runtime computes allowed values and
  rejects values outside that set after generation. This is preferred for long
  references or strings that may contain provider-hostile literals such as
  quotes.
- **Closed-world selection** — the runtime computes the set of allowed values
  first and the model selects from that set. This can be provider-enforced for
  short stable tokens, or runtime-enforced for long refs.
- **Grounding verification** — the runtime deterministically checks that a
  claim resolves against ground truth (source text, prior artifacts), so a
  semantically false-but-well-formed value can be rejected.

## The Two Approaches

### Approach A — Generate-and-Validate

**What it is.** The LLM generates the whole artifact through a single accepted
output channel: a runtime `submit_*` tool. The runtime validates the payload
against a schema, rejects unknown or runtime-owned fields, and retries on
failure. Correctness comes from "trust generation, reject failures, retry."

**Where it lives in the repo.**

- Submit tools: `submit_issue_artifact`, `submit_issue_stance_response`,
  `submit_issue_synthesis_response`, `submit_issue_deliberation_response`,
  `submit_deliberation_resolution`
  (`src/core-runtime/cli/structured-output-tools.ts`).
- Output channel lock: the Codex executor requires `--sandbox-mode=read-only`
  whenever a structured output format is requested, so structured artifact
  writes can only happen through the submit path
  (`src/core-runtime/cli/codex-review-unit-executor.ts`).
- Unknown-field rejection (fail-loud) in the submit assembly
  (`src/core-runtime/cli/structured-output-tools.ts`, allowed-fields gate).

**What it guarantees.** Output shape (valid JSON, expected top-level keys) and
the absence of runtime-owned fields. It also guarantees that free-form text or
stray files never become artifact truth, because downstream reads only the
runtime-produced YAML.

**What it does not guarantee by itself.** Meaning. A well-formed payload with a
wrong ref, a wrong category value, or an unsupported claim passes the shape
check unless a submit-time validator or artifact validator rejects it. In this
session the recurring failures were exactly this class: an evidence-ref outside
the allowed set, and a field whose intended meaning diverged from the runtime
contract.

### Approach B — Construct-and-Verify (closed-world selection + grounding verification)

**What it is.** The runtime owns artifact construction. The LLM supplies only the
irreducible semantic judgments. Wherever a value must come from a known set, the
runtime injects that set and the model selects (closed-world selection).
Wherever a claim is checkable against ground truth, the runtime verifies it and
rejects semantically (grounding verification). Correctness comes from
"construction by design," not from retry convergence.

**Where it already exists in the repo.**

- Static enums for closed vocabularies: `severity`, `issue_role`,
  `judgment_state`, `impact_kind`, `timing_class`, `closure_class`,
  `closure_obligation`, `relation`, `stance`, `confidence`,
  `root_hypothesis_position`, `severity_position`, etc.
  (`src/core-runtime/cli/structured-output-tools.ts`).
- Dynamic closed-world selection at the stance stage:
  `issueStanceResponseRowsField` binds `issue_id` to one known issue per row and
  keeps stance enums closed. `evidence_refs` are intentionally not emitted as a
  provider enum because long refs can contain quoted source text that strict
  structured output rejects. Those refs are validated against the runtime
  `issue_evidence_refs` allowed set at submit time
  (`src/core-runtime/cli/structured-output-tools.ts`).
- Grounding/fabrication check: `citation-audit.ts` substring-matches synthesize
  citations against participating lens outputs
  (`src/core-runtime/review/citation-audit.ts`).

**What it guarantees.** For provider-selected short fields, an invalid value can
be ungenerable. For runtime-selected long refs, an invalid value remains loud
and retryable without making the provider schema brittle. For verified fields,
a semantically ungrounded value can be rejected with a specific reason.

**What it costs.** The runtime must enumerate the option space before the LLM
step, must hold more deterministic verifier code, and risks "false constraint"
(the right answer is outside the offered set) and silent discretization (a
nuanced judgment rounded to the nearest allowed bucket). These are discussed in
the comparison and the precondition sections.

## Comparison

| Axis | A: Generate-and-Validate | B: Construct-and-Verify |
|---|---|---|
| Where enforced | after generation (validate + retry) | at construction (select) / deterministic check (verify) |
| Form correctness | medium; relies on retry to converge | high for selected fields |
| Meaning correctness | not addressed (shape only) | addressed where ground truth is decidable |
| Expressiveness | high (open vocabulary) | reduced where fields are closed |
| Global coherence | high (one pass, shared context) | at risk if judgments are over-decomposed |
| Failure visibility | loud (rejection, retry) | partly silent (rounding, verifier false-confidence) |
| Iteration speed | fast (prompt/schema edit) | slower (enumerator + verifier + schema move together) |
| Runtime complexity | thin runtime | thick runtime; verifier bugs become product bugs |
| Latency / parallelism | order-tolerant | deeper sequential dependency (option set must precede the call) |

Neither approach dominates. A is simpler and more expressive but only guarantees
shape. B guarantees more but is costlier, less expressive, and can convert loud
failures into quiet ones.

## Core Judgment

**The pipeline is already a hybrid; the remaining design work is field
assignment.** The current Codex structured-output path derives a provider schema
from submit tools and passes it through `codex exec --output-schema`. That means
provider-side strict schema is real on the Codex path, not merely advisory.
However, live E2E also proved that provider strict schema is the wrong place for
some values: long evidence refs containing quoted text can make the provider
reject the schema itself. Three observations now define the direction.

1. **Use provider strict schema for short closed values.** Enums such as
   severity, stance, issue role, judgment state, closure class, and issue ids in
   a bounded projection are good strict-schema fields.

2. **Use runtime allowed-set validation for long refs.** Evidence refs and some
   anchors may include quotes, paths, or source snippets. They should stay as
   strings in provider schema and be checked by the runtime against an allowed
   set.

3. **Grounding verification should block only when the ground truth is
   decidable.** Citation-style substring audits remain warning-prone for free
   prose, but anchor/ref resolution against a known source set can become a hard
   gate.

## Recommended Direction

Keep the hybrid. The right form of it is **per-field assignment of the strongest
mechanism that fits, with validate-and-retry as the provider/field fallback** —
not "run both methods and compare." Avoid both extremes: do not push every
output into provider strict schema, and do not leave machine-consumed artifact
truth as unconstrained free text.

### Stage-Level Control Matrix

| Stage | LLM role | Schema control | Runtime ownership / validation | Open semantic area |
|---|---|---|---|---|
| Lens sidecar | Judge material findings and causal paths | Provider strict schema plus submit tool | `session_id`, `lens_id`, `candidate_id`, YAML write, severity enum, required material fields | `claim`, `why`, `how_to_fix`, causal narrative |
| Finding ledger | Normalize lens sidecars into finding truth | Prefer deterministic runtime projection; keep LLM use minimal | `finding_id`, `source_ref`, `lens_id`, severity/materiality/causal shape | Source meaning preserved from sidecar |
| Finding relation graph | Judge causal overlap, duplication, shared causes | Relation/confidence enums; refs as strings | Known finding/cause refs, endpoint coverage, singleton coverage | `reason`, shared-cause claim |
| Issue ledger | Cluster findings into root-cause issues | Issue shape plus severity/confidence enums | `issue_id`, `issue_dependencies`, evidence/source refs projection | `issue_statement`, `root_cause_hypothesis`, `impact` |
| Issue stance responses | Judge one lens's stance for every issue | `issue_id` and stance enums provider-strict | Evidence refs validated by runtime allowed set | `rationale` |
| Issue stance matrix | Merge stance responses | No direct LLM write | Runtime merge, missing stance, non-participant, ref validation | None |
| Deliberation plan | Select conflict/participant work | Conflict and skip-reason enums | Candidate issue/participant refs validation | `conflict_summary`, `resolution_question` |
| Issue deliberation responses | Re-judge issue-scoped disagreement | Stance/update enums plus submit tool | `issue_id`, `lens_id`, source stance refs | Difference explanation, updated rationale |
| Deliberation resolution | Resolve controlled conflicts | Resolution status enum plus structured rows | Accepted lenses, remaining disagreement, issue refs | `final_root_cause`, `reason` |
| Problem framing | Classify admission and closure | Common spine enums from single source | `classification_context`, `related_surface_finding_ids` | `problem_definition`, `rationale`, bounded domain axes |
| Synthesis work items | Select synthesis targets | No direct LLM write | Runtime creates work items from admitted material issues | None |
| Issue synthesis responses | Explain each material issue | Response shape plus action-candidate enum | `work_item_id`, `issue_id`, source refs | Materiality/root cause/causal path/action prose |
| Synthesis ledger/projection | Merge issue syntheses | No direct LLM write | Runtime merge, ordering, counts, refs | None |
| Review record/final output | Produce canonical record and human view | Record schema validation | Runtime classification, counts, action candidates, final rendering | Final wording from synthesis prose |

### Field-Level Assignment

| Field kind | Primary control |
|---|---|
| Short closed values: severity, stance, issue role, judgment state, closure class | Provider strict enum plus runtime enum validation |
| Runtime-known ids: issue id, finding id, lens id | Runtime-owned when possible; provider enum only when the LLM must select |
| Long refs and source snippets | Provider enum forbidden; string field plus runtime allowed-set validation |
| Evidence anchors | Runtime grounding/blocking validation when source truth is decidable |
| Causal/material rationale | Free generation with structured shape checks |
| Artifact serialization/write | Runtime only |

### Priority Work

1. **Extend single-source schemas.** Continue moving closed vocabularies and
   required field lists into canonical TS sources that derive submit schemas,
   validators, and provider schemas together. `problem-framing` common spine is
   the current pattern.
2. **Move ids toward runtime ownership.** `finding_id`, `cause_id`, issue
   dependency ids, and merge/projection ids should be minted or post-mapped by
   runtime whenever downstream references can be kept stable.
3. **Promote decidable grounding to blocking.** Evidence anchor resolution and
   allowed-ref checks should block. Free-text synthesis citation audits should
   remain warning-only unless false positives are under control.

## Non-Negotiable Precondition: Single Source of Truth

A hybrid multiplies the places a single constraint lives: the enum in
`structured-output-tools.ts`, the allowed-fields set in the validator, the
allowed set in the grounding check, and the prompt text. This is a drift
surface, and the codebase has already shown the failure (the `materiality_basis`
divergence; the validator-vs-submit-schema enum mismatch noted in the session on
2026-06-07).

Therefore, per stage, define one canonical schema and derive from it: the submit
tool schema, the validator, the grounding allowed-set, and (where supported) the
provider strict schema. Without this discipline, a hybrid is strictly worse than
either pure approach because it doubles the drift surface.

## Field Assignment Rubric

For each artifact field, assign exactly one primary mechanism:

- **Provider closed selection** — the value must come from a short stable set
  the runtime can enumerate before the call. Invalid becomes ungenerable when
  the provider honors strict schema.
- **Runtime closed validation** — the value must come from a runtime set, but
  the set is unsuitable for provider enum literals because values are long,
  source-derived, or quote-heavy. Invalid becomes a fail-loud retry.
- **Grounding-blocked** — the value is open text but is checkable against ground
  truth (evidence anchors, resolvable refs). Invalid is rejected with a reason.
- **Free generation** — the value is genuinely open and not decidably checkable
  (causal narrative, materiality rationale). Generate freely, keep it out of the
  canonical truth path, and accept that no structural mechanism guarantees it.

The boundary between grounding-blocked and free generation is a domain judgment
and should be set per stage using a benchmark, not assumed.

## Open Questions / Verification Needed

- Provider strict support outside Codex: confirm in `src/core-runtime/llm` which
  direct-call providers can enforce strict tool/response schemas, and what the
  fallback is for those that cannot.
- Runtime id minting: confirm whether `finding_id` and `cause_id` can be runtime
  assigned without breaking downstream references in relation-graph and
  deliberation.
- Boundary calibration: run a per-stage A/B on finding-ledger to measure whether
  moving ids/refs to runtime ownership preserves causal-reasoning quality before
  committing the field to closed validation.

## References

- Session: `019e92b5-9c9a-7690-ab53-9dc82c5df651` (Codex, 2026-06-04..06-07),
  sidecar submit contract and live E2E.
- `src/core-runtime/cli/structured-output-tools.ts` — submit tool schemas,
  static enums, dynamic stance enum, allowed-fields gate.
- `src/core-runtime/review/issue-artifact-runtime.ts` — submit tools and
  runtime-owned field policy.
- `src/core-runtime/cli/codex-review-unit-executor.ts` — read-only sandbox lock
  for structured output.
- `src/core-runtime/review/citation-audit.ts` — grounding/fabrication audit
  (warning-only).
- External survey (2026): structured-output / constrained-decoding landscape and
  the DCCD draft-then-constrain direction (decouple semantic planning from
  structural enforcement).
