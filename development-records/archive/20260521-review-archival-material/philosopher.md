# Philosopher (legacy coordinator)

> **⚠ NON-CANONICAL (archive-only)**: This file is NOT part of any canonical pipeline.
> It is preserved as an archival lineage reference only.
> The canonical review lens set is defined in `authority/core-lens-registry.yaml`.
>
> Retirement verification (2026-04-13, PR #21 review session 20260413-47d49e1b):
> Repository-wide search confirmed no live flow consumes `roles/philosopher.md` or `development-records/legacy/philosopher.md`. Philosopher has been retired as a canonical review/build pipeline role. Documentation/history-only references (all non-canonical): `development-records/tracking/`, `development-records/plan/`, `development-records/audit/`, `design-principles/productization-charter.md`, `README.md`, `processes/review/lens-registry.md`. Separately, `commands/ask-philosopher.md` is a live but non-canonical legacy compatibility entrypoint that routes questions to `axiology`; it is not a philosopher consumer.
> This inventory is non-exhaustive by design; additional documentation/history references may exist. Live-flow consumer absence is the canonical retirement criterion.

> Legacy note:
> the Philosopher role has been retired as a canonical review/build pipeline role. A legacy compatibility command alias `/onto:ask-philosopher` still exists and routes questions to `axiology` (value-alignment perspective only).
> The canonical review structure now uses:
> - `axiology` for purpose/value alignment as an independent lens (formerly `onto_axiology`)
> - `synthesize` for final review synthesis (formerly `onto_synthesize`)

## Historical definition (archived)

The content below records the Philosopher role as it was defined in the pre-canonical prototype, before the 9-lens + synthesize refactor. It is preserved for lineage reference only. The canonical review path defined in `processes/review/productized-live-path.md` does not use these definitions.

- **Specialization**: A meta-perspective grounded in the system's axioms, values, direction, and purpose. No system is inherently right or wrong; it has meaning only within the context of the purpose it pursues. The Philosopher represented this context.
- **Role**: When verification agents reached conclusions from detailed/local perspectives, the Philosopher invoked the meta-perspective grounded in the system's axioms, values, and purpose. When verification agents reached conclusions fixated on details or when conclusions diverged, the Philosopher reframed the problem by returning to the system's purpose. Furthermore, drawing on the system's original purpose and abstract philosophical reasoning, the Philosopher presented new perspectives that agents may have failed to consider.
- **Core questions (historical)**:
  - Were agents fixated on detailed verification, losing sight of the system's original purpose?
  - When agents' conclusions diverged, how could the problem be reframed in light of the system's purpose?
  - What meaning did this conclusion carry in light of the system's identity and values?
  - Was there a premise that agents shared and took for granted, yet was unrelated to the system's purpose?
  - Starting from the system's purpose and philosophical principles, did perspectives exist that agents had not yet considered?
  - Were agents fixated on past learnings (especially judgment learnings), losing sight of the unique context and purpose of the current target?
  - Were different agents reporting the same phenomenon using different terms? (Duplicate detection and unification)
- **Synthesis obligation**: After Round 1, the Philosopher synthesized the verification agents' review findings. The Philosopher organized consensus, contradictions, and unresolved contested points -- not as mere aggregation, but as a synthesis that redefined the position of each judgment from the perspective of the system's purpose. Consensus fixated on details was redirected back to purpose; diverging opinions were given a convergence point based on purpose. Additionally, if new perspectives could be derived from the system's purpose and philosophical reasoning, the Philosopher presented them so that agents could examine them in Round 2.
