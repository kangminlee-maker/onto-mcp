# G(c) — final-output append-sections registry parity, implementation design (v2)

> Status: **DESIGN v2 — hard-slice cross-validated (ultracode 8 confirmed mediums + onto 9 issues, all resolved below); implementation NOT started.**
> Parent track: G-tractable governance parity. G(b) merged as PR #108 (guard **G8 / INV-SCHEMA-1**, the prompt-projection field-parity precedent this design extends to final-output sections). This is the **G(c)** leg, split out of #108 after cross-validation found it far riskier than the loader/G(b) parts.
> Branch `feat/conservation-gc-append-sections` off main `44fc4d0` (no commits yet).
> Cross-validation records: ultracode `wf_6a306415-b7e` (6 lenses → adversarial verify; 15 raised → **8 confirmed, all medium**) + onto `20260622-4e9d7738` (core-axis 6 lenses; **9 issues, all medium**). Prior #108-sweep G(c) findings (durable): the G(c) subset of `development-records/tracking/20260622-g-tractable-xval-findings.json`.
> **v2 changes vs v1**: the heading SSOT now covers ALL 8 emitter headings (v1 missed the 5 bound emitters' inline literals); the prompt-policy and bindings orders are encoded INDEPENDENTLY (they differ today); `required_fragments` section-ids are DERIVED from the module (drift-proof); the completeness mechanism Q-C is CLOSED (enforceable sweep + fixture matrix); `activation` is in the guard; `append_owner` is split into `emit_owner` + `provenance_binding_required`.

## 1. Why (the drift class, for final-output sections)

The reconstruct final output emits a fixed set of markdown sections, but **no registry node owns the canonical section set**, and the set is duplicated across **multiple representations** that can silently diverge:
1. the **prompt-policy hint** `final_output_prompt_policy.deterministic_runtime_append_sections` (run.ts:4393-4399) — 5 **underscore** ids fed to the host LLM;
2. the **provenance bindings** `finalOutputProvenanceSectionBindings()` (run.ts:10340-10560) — 5 **hyphen** `section_id`s + `heading`s + `required_fragments`, consumed by the final-output provenance **gate**;
3. the **8 emitter functions** that each render a `## <Heading>` literal into the output (5 bound + 3 conditional);
4. for the bound sections, the heading thus lives in **two** code sites today (the emitter literal AND `binding.heading`).

A section added/renamed/dropped in code has no registry home and no cross-representation check — the same "new field undeclared / declared-not-enforced" class G(b) closed for the prompt-projection contract, now for final-output sections. G(c) gives the section set a single registry-declared canonical identity + a parity guard.

## 2. Confirmed current state (re-grounded against main `44fc4d0`)

**The runtime emits 8 sections** at the emit sequence (run.ts:13373-13392), each via its own `appendFinalOutput*Section` fn that renders an inline `## <Heading>` literal, then `validateFinalOutputProvenance` runs on the 5 bindings only.

**A. 5 provenance-bound sections.** For each, the heading exists in TWO code sites: the **emitter** fn's inline `## <Heading>` literal (what is rendered) and the **`binding.heading`** field (what the gate searches for). They must agree or the gate fails.

| section_id (hyphen) | heading (gate key) | emitter fn (inline `## ` literal) | prompt_policy_id (underscore) | required_fragments |
|---|---|---|---|---|
| `seed-answerability` | Seed Answerability | `appendFinalOutputAnswerabilitySection` (run.ts:10075) | `seed_answerability` | 2 prose |
| `claim-projection` | Claim Projection | `appendFinalOutputClaimProjectionSection` (run.ts:10092) | `claim_projection` | 2 paths + 2 prose |
| `artifact-truth` | Artifact Truth | `appendFinalOutputArtifactTruthSection` (run.ts:10201) | `artifact_truth` | ~70 path refs |
| `runtime-artifact-truth-footer` | Runtime Artifact Truth Footer | `appendFinalOutputProvenanceFooter` (run.ts:10041) | `provenance_footer` | dynamic `finalFragments` |
| `runtime-provenance-bindings` | Runtime Provenance Bindings | `appendFinalOutputProvenanceBindingsSection` (run.ts:10055) | `provenance_bindings` | **the 4 other section_ids as literal text** (run.ts:10552-10557) |

**B. 3 conditional non-bound sections** (heading-only; no section_id; not in bindings; not gate-checked):

| emitter fn | heading | activation |
|---|---|---|
| `appendFinalOutputDocumentProjectionTruncationSection` (run.ts:9976) | `## Source Projection Truncation` | `documentProjectionTruncations.length > 0` |
| `appendFinalOutputWorkbookInventoryProjectionTruncationSection` (run.ts:10011) | `## Workbook Inventory Projection Truncation` | `workbookInventoryProjectionTruncations.length > 0` |
| `appendFinalOutputUnresolvedRevisionSection` (run.ts:9927) | `## Unresolved Revision Proposals` | `disclosed.length > 0` (M4a) |

**Two ORDERS, which differ today** (xval ultracode #1/#3 — confirmed):
- **prompt-policy order** (run.ts:4393-4399): `seed_answerability, claim_projection, artifact_truth, provenance_footer, provenance_bindings` (claim BEFORE artifact). Emitted verbatim into the host-LLM prompt via `JSON.stringify(...)` at run.ts:9381.
- **bindings-array order** (run.ts:10417-10559): `seed-answerability, artifact-truth, claim-projection, runtime-artifact-truth-footer, runtime-provenance-bindings` (artifact BEFORE claim). **Load-bearing**: rendered in order into the Runtime Provenance Bindings section text (run.ts:10059-10064) AND into the persisted `writeFinalOutputProvenanceValidationArtifact` `section_bindings` + the order-dependent `required_fragments` dedup (run.ts:10293-10295, 10312).

So the two orders are NOT the same list — positions 2/3 (claim/artifact) are swapped. A single module row order cannot drive both.

**Three load-bearing facts the design must respect:**
- **Heading is the gate's identity, not section_id** (xval #8 HIGH): `validateFinalOutputProvenance` (post-seed-validation.ts:2121-2141) matches each section by `markdownSectionText(text, binding.heading)`; `section_id` is only the violation `subjectId`. Heading drift (emitter OR binding) breaks the gate.
- **The hyphen `section_id`s are themselves validated text** (xval #6 HIGH): `runtime-provenance-bindings.required_fragments` = `["seed-answerability","artifact-truth","claim-projection","runtime-artifact-truth-footer"]` (run.ts:10552-10557) — the 4 other section_ids the gate requires present in the rendered bindings section.
- **The prompt-policy list is informational and does NOT feed the reuse hash** (xval #9): `deterministic_runtime_append_sections` is read only by run.test.ts:4204-4211 (via order-insensitive `arrayContaining`), never by the append logic, not in `AuthoredArtifactReuseMatch`. Id/order changes change only prompt TEXT + that one test.

## 3. Design

### 3.0 Architecture — module SSOT + registry declaration + parity guard (mirror G8), now covering ALL 8 emitter headings

- **New module `src/core-runtime/reconstruct/final-output-sections.ts`** — the canonical descriptor list of the 8 sections. Per row:
  ```
  { section_id, heading, prompt_policy_id | null, emit_owner, provenance_binding_required, activation }
  ```
  - `emit_owner` ∈ {`always_section`, `conditional_markdown`} — the EMISSION classification (5 always / 3 conditional). This is distinct from `provenance_binding_required` (the gate-binding flag). **(onto issue-006: do NOT name the field `append_owner` with a value `provenance_binding`, which conflates emitter ownership with binding state.)**
  - `provenance_binding_required: true` for the 5 bound rows, `false` for the 3 conditional.
  - `prompt_policy_id` = the underscore id for the 5 bound rows, `null` for the 3 conditional (they are not in the prompt-policy list).
  - `activation`: `always` for the 5 bound; the predicate label for the 3 conditional.
  - `heading`: the BARE heading (no `## ` prefix). Exports: the heading constants, `promptPolicyAppendSectionIds()` (the underscore ids in **prompt-policy order**), and `provenanceBindingSectionIds()` (the bound section_ids in **bindings order**).
- **TWO independent orders, both pinned in the module** (xval #1/#3): the module carries an explicit `promptPolicyOrder` (the 5 underscore ids, claim-before-artifact) and a `bindingsOrder` (the 5 bound section_ids, artifact-before-claim). `promptPolicyAppendSectionIds()` returns the former; `finalOutputProvenanceSectionBindings` is built in the latter. Neither is derived from the other.
- **run.ts CONSUMES the module for EVERY emitter heading** (the G8 consumption invariant, extended to all 8): all 8 `appendFinalOutput*Section` fns render `## ${MODULE_HEADING}` from the module's bare heading constant (run.ts prepends `## ` at the emit site — defined prefix convention); `finalOutputProvenanceSectionBindings` sets each `heading` from the same module constant; `deterministic_runtime_append_sections = promptPolicyAppendSectionIds()`. So for every section there is ONE heading string source.
- **`runtime-provenance-bindings.required_fragments` is DERIVED from the module** (xval #8 + onto issue-005): run.ts builds that array from `provenanceBindingSectionIds()` minus `runtime-provenance-bindings` itself (the other 4, in bindings order) — NOT a hand-maintained literal. Drift-proof by construction; clause-5 (§3.1) then has a real, non-vacuous source.
- **Registry node `final_output_append_sections`** in `reconstruct-contract-registry.yaml` declares the 8 rows (`section_id`, `heading`, `prompt_policy_id`, `emit_owner`, `provenance_binding_required`, `activation`).
- **New guard `scripts/check-final-output-sections-parity.ts` (G9, INV-SCHEMA-1)** asserts module ⟷ registry parity + run.ts consumption + completeness (§3.1).

**Why module-derives, not registry-derives** (xval #7/#14/#36): run.ts derives its representations from the **module** (the runtime SSOT); the guard compares **module to registry**. Real parity (the module is an independent runtime surface), not the vacuous registry-vs-self anti-pattern. The module's `prompt_policy_id`s are the existing underscore strings in the existing order, so the prompt surface is **byte-identical** (verified by an exact-ORDERED test, not `arrayContaining` — §6).

### 3.1 The guard's assertions (G9)

1. **Exact-set, heading-PRIMARY** (xval #8): the registry rows' `heading` set EXACTLY equals the module's; same for `section_id`; same for the non-null `prompt_policy_id` set. Heading is primary (the gate's identity); section_id and prompt_policy_id are also asserted. **Heading uniqueness** is asserted (no two rows share a heading — the gate keys on it) (onto issue-005).
2. **Per-row attribute equality** keyed by section_id: registry `heading` / `prompt_policy_id` / `emit_owner` / `provenance_binding_required` / **`activation`** equal the module's. **(onto issue-003/009: `activation` IS in the per-row equality — it is a canonical field, not a registry decoration.)**
3. **run.ts SSOT consumption** (the G8 invariant, all 8 sections): run.ts imports the heading constants / `promptPolicyAppendSectionIds` / `provenanceBindingSectionIds` from `final-output-sections.ts`, references them, and holds **no inline `## <Heading>` literal** for any of the 8 sections (the bound emitters too — v1 missed this).
4. **Completeness / anti-fooling — ENFORCEABLE** (xval #0 + onto issue-001/002/004/007/008 — the decisive cluster; Q-C now CLOSED): two mechanisms, not one fixture:
   - **(static) source-region sweep**: scan the final-output emit region of run.ts for `## ` heading literals and for `appendFinalOutput*Section` function definitions; assert every emitted `## <Heading>` is a module heading constant (no inline literal) and every `appendFinalOutput*Section` fn's heading is module-sourced. A 9th section added with an inline heading fails. (This is a source-text check; its boundary — it cannot parse arbitrary obfuscation — is the same one G8 R5 documented, backstopped by the behavioral matrix below.)
   - **(behavioral) fixture matrix**: a test that activates EVERY append path (incl. populating `documentProjectionTruncations` + `workbookInventoryProjectionTruncations` + disclosed revisions — xval #6) and asserts the emitted output's `## ` heading set equals the module's expected-active set. A section that emits a heading not in the module is caught.
   - §5's "a 9th section without a registry row fails CI" is backed by BOTH (not a single fixture). (If the team later judges the static sweep too brittle, the fallback is to narrow §5 to the detectable class — but the default is the enforceable pair.)
5. **required_fragments cross-check** (xval #6): since run.ts DERIVES `runtime-provenance-bindings.required_fragments` from `provenanceBindingSectionIds()` (§3.0), the guard asserts that derivation site exists (run.ts builds it from the module, not a literal) — so the load-bearing validated-text list cannot drift from the canonical set by construction.

### 3.2 Conditional (heading-only) sections — bind the guard to the real emitter (xval #3/#15/#23)

The 3 conditional sections get a canonical `section_id` in the module (`source-projection-truncation`, `workbook-inventory-projection-truncation`, `unresolved-revision-proposals`) with `emit_owner: conditional_markdown`, `provenance_binding_required: false`, `prompt_policy_id: null`, and the `activation` predicate label. Their append fns emit `## ${MODULE_HEADING}` from the module heading constant (same treatment as the 5 bound emitters). The guard ties the registry row to the real emitter via the module constant — not a self-referential presence check.

### 3.3 Explicit prompt-policy alias map (xval #10/#13) + the two orders

Underscore↔hyphen is **3 clean + 2 renames**, carried per-row as `prompt_policy_id` (underscore) vs `section_id` (hyphen): `seed_answerability`↔`seed-answerability`, `claim_projection`↔`claim-projection`, `artifact_truth`↔`artifact-truth` (clean); `provenance_footer`↔**`runtime-artifact-truth-footer`**, `provenance_bindings`↔**`runtime-provenance-bindings`** (renames). The module carries both columns; nothing is a mechanical `s/_/-/`. `promptPolicyAppendSectionIds()` emits the underscore ids in **prompt-policy order** (claim before artifact) — byte-identical to today.

## 4. Concept economy

- 1 new module `final-output-sections.ts` (the section-descriptor SSOT) — sibling to `competency-projection-contract.ts` (G8).
- 1 new registry node `final_output_append_sections`.
- 1 new guard `check-final-output-sections-parity.ts` (G9), registered in `check-invariant-drift` + CI, **mapped to INV-SCHEMA-1** (same drift class as G8 — no new invariant, no marker churn; add a G9 row to the INVARIANTS.md enforcement table as doc hygiene).
- run.ts: all 8 emitters + the bindings array + the prompt-policy list + the required_fragments array become consumers of the module — **consolidating 4 scattered heading copies (emitter literal, binding.heading, prompt-policy hint, required-fragment literal) into 1 source** (v1 undercounted this as 3).
- The 3 conditional sections gain a canonical `section_id` (a real new identity for previously-anonymous markdown — justified: it is what makes them governable).
- Field naming: `emit_owner` (emission surface) is separate from `provenance_binding_required` (gate-binding) — distinct authorities (onto issue-006).

## 5. Success criteria

- The 8 final-output sections have a single registry-declared canonical identity (`section_id` + `heading` + `prompt_policy_id` + `emit_owner` + `provenance_binding_required` + `activation`), and run.ts derives EVERY heading (all 8 emitters + bindings + prompt-policy + required_fragments) from one module.
- Adding/renaming/dropping a section (or changing a heading at the emitter OR binding, or adding a 9th append section) without updating the registry fails CI (G9): an emitter-heading rename is caught (no inline literal allowed → it must change the module constant → parity vs registry fails); a section_id rename is caught (parity + the derived required_fragments); a new section is caught (static sweep + behavioral matrix).
- **Zero prompt-surface change, VERIFIED**: `deterministic_runtime_append_sections` emits the 5 underscore ids in the SAME order — asserted by an exact-ordered `toEqual` (not `arrayContaining`); the provenance gate behavior (headings + required_fragments) is unchanged; the bindings-array order (and the persisted validation artifact order) is unchanged — asserted by an order check.
- Full vitest + guards green (baseline after #108 = full vitest 1766).

## 6. Test plan

- **Guard self-test** (pure-function pattern, as G8): module⟷registry matched state passes; negative cases fail — heading drift, section_id drift, prompt_policy_id drift, `emit_owner`/`provenance_binding_required`/**`activation`** drift, duplicate heading, a registry row with no module row (and vice versa), an inline `## ` heading literal in run.ts for a section.
- **Ordering tests**: exact-ordered `toEqual` on `deterministic_runtime_append_sections` (= the frozen current array, claim before artifact); an order assertion on `finalOutputProvenanceSectionBindings` (artifact before claim) and on the persisted `section_bindings`.
- **Behavioral matrix** (xval #6): a fixture that activates EVERY append path — non-empty `documentProjectionTruncations`, `workbookInventoryProjectionTruncations`, and disclosed revision proposals — so all 3 conditional headings emit; assert the emitted `## ` heading set equals the module's expected-active set, and that each emitted heading equals its module constant.
- **Behavioral regression**: existing run.test.ts final-output assertions (4204-4211 underscore ids, the heading assertions ~2780+, the unresolved-revision heading ~6527/6543) pass UNCHANGED — proving the extraction is behavior-preserving.

## 7. Open questions — RESOLVED by cross-validation

- **Q-A (module boundary)** → the module owns section IDENTITY incl. **all 8 emitter headings** (bare heading constants) + the two orders; run.ts owns the dynamic authority/validation/`required_fragments`-path refs, but DERIVES the `runtime-provenance-bindings.required_fragments` section-id list from the module (drift-proof). [ultracode #2/#4/#5/#7/#8, onto issue-005]
- **Q-B (heading constants)** → ALL 8 emitter fns (5 bound + 3 conditional) emit `## ${moduleHeading}`; no inline `## ` literal survives. [ultracode #2/#4/#5]
- **Q-C (completeness mechanism)** → CLOSED: enforceable = static source-region sweep (no inline heading literal / every append fn module-sourced) + behavioral fixture matrix activating every path; §5 stays strong, backed by both. [onto issue-001/002/004/007/008]
- **Q-D (required_fragments)** → DERIVE the section-id list from the module (not a literal, not a registry copy) → drift-proof; the dynamic path fragments stay in run.ts. [ultracode #8, onto issue-005]
- **Q-E (INV id)** → INV-SCHEMA-1 (same as G8).
- **NEW — ordering** → the module pins the prompt-policy order and the bindings order INDEPENDENTLY; both are verified by exact-ordered tests. [ultracode #1/#3]
- **NEW — field naming** → `emit_owner` (emission surface) ≠ `provenance_binding_required` (gate binding). [onto issue-006]

## 8. Implementation-process plan (after this gate)

Ordered, each step independently verifiable; redesign trigger = any step reveals a prompt-surface or gate-behavior change that §5 forbids (caught by the exact-ordered + order tests).

1. **Extract `final-output-sections.ts`**: 8 rows + bare heading constants + `promptPolicyAppendSectionIds()` (prompt-policy order) + `provenanceBindingSectionIds()` (bindings order). No run.ts change yet. Unit test the module shape (incl. both orders).
2. **Rewire run.ts to consume it**: all 8 `appendFinalOutput*Section` fns emit `## ${moduleHeading}`; `finalOutputProvenanceSectionBindings` sources each `heading` from the module (bindings order) and DERIVES `runtime-provenance-bindings.required_fragments` from `provenanceBindingSectionIds()`; `deterministic_runtime_append_sections = promptPolicyAppendSectionIds()`. Verify run.test.ts final-output assertions pass UNCHANGED + the new exact-ordered/order tests — the critical behavior-preservation gate.
3. **Add the registry node** `final_output_append_sections` (8 rows). Verify loader tolerates it + registry-verification tests pass (additive metadata node, as G(b)'s `prompt_projection_contracts`).
4. **Add the guard** `check-final-output-sections-parity.ts` (pure `evaluate...` + thin main, as G8) + self-test + the behavioral matrix; register in `check-invariant-drift` (G9) + CI + INVARIANTS.md doc + npm script.
5. **Verify**: `check:ts-core` → targeted (run.test.ts, post-seed-validation tests, the new guard self-test + matrix, registry-verification) → guards (import-boundary / spec-defaults / invariant-drift incl. G9) → run the guard directly → full vitest (baseline 1766) → confirm zero prompt-surface / gate-behavior change.
6. **PR** (own PR, base main) → `@codex review` → converge → user-confirm → squash merge + cleanup + memory.

## 9. Cross-validation record

- **ultracode** `wf_6a306415-b7e` (6 lenses → adversarial verify, 21 agents): 15 raised → **8 confirmed (all medium)** — heading SSOT incompleteness for the 5 bound emitters (×4 findings), the two-order conflict (×2), the required_fragments source surface (×1), and the truncation-section test-coverage gap (×1). All folded into §2/§3.0/§3.1/§5/§6/§7.
- **onto** `20260622-4e9d7738` (core-axis 6 lenses): **9 issues (all medium)** — Q-C completeness mechanism unresolved (×5 issues → §3.1.4 enforceable pair), `activation` omitted from the guard (×2 → §3.1.2), heading uniqueness + required_fragments literals underspecified (§3.0/§3.1.1/§3.1.5), `append_owner` naming conflation (§3.0 `emit_owner` split). All folded.
- Net: the core architecture (module SSOT + registry + guard parity, INV-SCHEMA-1) holds; the revisions broaden the rewire to **all 8 emitter headings** (v1 covered only the binding side + 3 conditional fns), pin **two independent orders**, derive **required_fragments**, close **Q-C** enforceably, add **activation** to the guard, and rename **emit_owner**. No blocker/high in either leg.
