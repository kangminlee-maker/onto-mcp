/**
 * Single source of truth for the reconstruct final-output append-section set (G(c)).
 *
 * The final output emits a fixed set of markdown sections. Their identity (section_id,
 * heading, prompt-policy id, emission ownership, provenance-binding requirement,
 * activation) used to be scattered across run.ts in up to FOUR copies per section — the
 * emitter fn's inline `## <Heading>` literal, the provenance binding's `heading` field, the
 * prompt-policy `deterministic_runtime_append_sections` hint, and (for the bindings section)
 * the `required_fragments` section-id literal. This module is the one place that identity
 * lives; run.ts consumes it for ALL of those representations, and the G9 parity guard
 * (scripts/check-final-output-sections-parity.ts, INV-SCHEMA-1) asserts the registry node
 * `final_output_append_sections` declares exactly this surface. Side-effect-free.
 *
 * Headings are BARE (no `## ` prefix): run.ts prepends `## ` at the emit site, and the
 * provenance gate matches on `## ` + heading (post-seed-validation.ts via markdown-section).
 *
 * Two ORDERS that differ today are pinned INDEPENDENTLY here (neither derived from the other):
 *   - the prompt-policy order (claim before artifact) — PROMPT_POLICY_APPEND_SECTION_IDS;
 *   - the provenance-bindings order (artifact before claim) — the bound-row order of
 *     FINAL_OUTPUT_SECTIONS, exposed via provenanceBindingSectionIds().
 */

/** Canonical hyphen section ids (also the load-bearing required_fragments text). */
export const FINAL_OUTPUT_SECTION_IDS = {
  seedAnswerability: "seed-answerability",
  claimProjection: "claim-projection",
  artifactTruth: "artifact-truth",
  runtimeArtifactTruthFooter: "runtime-artifact-truth-footer",
  runtimeProvenanceBindings: "runtime-provenance-bindings",
  sourceProjectionTruncation: "source-projection-truncation",
  workbookInventoryProjectionTruncation: "workbook-inventory-projection-truncation",
  unresolvedRevisionProposals: "unresolved-revision-proposals",
} as const;

/** Bare section headings (no `## ` prefix). The emit site prepends `## `. */
export const FINAL_OUTPUT_SECTION_HEADINGS = {
  seedAnswerability: "Seed Answerability",
  claimProjection: "Claim Projection",
  artifactTruth: "Artifact Truth",
  runtimeArtifactTruthFooter: "Runtime Artifact Truth Footer",
  runtimeProvenanceBindings: "Runtime Provenance Bindings",
  sourceProjectionTruncation: "Source Projection Truncation",
  workbookInventoryProjectionTruncation: "Workbook Inventory Projection Truncation",
  unresolvedRevisionProposals: "Unresolved Revision Proposals",
} as const;

const ID = FINAL_OUTPUT_SECTION_IDS;
const H = FINAL_OUTPUT_SECTION_HEADINGS;

export type FinalOutputSectionEmitOwner = "always_section" | "conditional_markdown";

export interface FinalOutputSectionDescriptor {
  /** Canonical hyphen id — also the load-bearing required_fragments text for bound rows. */
  section_id: string;
  /** Bare heading (the provenance gate's identity; matched as `## ` + heading). */
  heading: string;
  /** Underscore id in the prompt-policy hint; null for conditional (non-prompt) sections. */
  prompt_policy_id: string | null;
  /** Emission surface classification — distinct from provenance_binding_required. */
  emit_owner: FinalOutputSectionEmitOwner;
  /** Whether the section is checked by the final-output provenance gate. */
  provenance_binding_required: boolean;
  /** Activation predicate label: `always`, or the conditional predicate. */
  activation: string;
}

/**
 * Canonical ordered descriptors. The 5 bound rows are in the PROVENANCE-BINDINGS order
 * (artifact before claim) — this is the order finalOutputProvenanceSectionBindings emits and
 * the order persisted into the validation artifact, so it is load-bearing and must be
 * preserved. The 3 conditional rows follow in emit order.
 */
export const FINAL_OUTPUT_SECTIONS: readonly FinalOutputSectionDescriptor[] = [
  { section_id: ID.seedAnswerability, heading: H.seedAnswerability, prompt_policy_id: "seed_answerability", emit_owner: "always_section", provenance_binding_required: true, activation: "always" },
  { section_id: ID.artifactTruth, heading: H.artifactTruth, prompt_policy_id: "artifact_truth", emit_owner: "always_section", provenance_binding_required: true, activation: "always" },
  { section_id: ID.claimProjection, heading: H.claimProjection, prompt_policy_id: "claim_projection", emit_owner: "always_section", provenance_binding_required: true, activation: "always" },
  { section_id: ID.runtimeArtifactTruthFooter, heading: H.runtimeArtifactTruthFooter, prompt_policy_id: "provenance_footer", emit_owner: "always_section", provenance_binding_required: true, activation: "always" },
  { section_id: ID.runtimeProvenanceBindings, heading: H.runtimeProvenanceBindings, prompt_policy_id: "provenance_bindings", emit_owner: "always_section", provenance_binding_required: true, activation: "always" },
  { section_id: ID.sourceProjectionTruncation, heading: H.sourceProjectionTruncation, prompt_policy_id: null, emit_owner: "conditional_markdown", provenance_binding_required: false, activation: "document_projection_truncation_nonempty" },
  { section_id: ID.workbookInventoryProjectionTruncation, heading: H.workbookInventoryProjectionTruncation, prompt_policy_id: null, emit_owner: "conditional_markdown", provenance_binding_required: false, activation: "workbook_inventory_projection_truncation_nonempty" },
  { section_id: ID.unresolvedRevisionProposals, heading: H.unresolvedRevisionProposals, prompt_policy_id: null, emit_owner: "conditional_markdown", provenance_binding_required: false, activation: "disclosed_revision_proposals_nonempty" },
];

/**
 * The prompt-policy `deterministic_runtime_append_sections` order (claim BEFORE artifact) —
 * pinned independently of the bindings order. Its SET must equal the non-null
 * prompt_policy_id set of FINAL_OUTPUT_SECTIONS (asserted by the G9 guard); its ORDER is the
 * frozen current prompt surface (asserted byte-for-byte by an exact-ordered run.test.ts test).
 */
export const PROMPT_POLICY_APPEND_SECTION_IDS = [
  "seed_answerability",
  "claim_projection",
  "artifact_truth",
  "provenance_footer",
  "provenance_bindings",
] as const;

export function promptPolicyAppendSectionIds(): string[] {
  return [...PROMPT_POLICY_APPEND_SECTION_IDS];
}

/** The bound section_ids in provenance-bindings order (artifact before claim). */
export function provenanceBindingSectionIds(): string[] {
  return FINAL_OUTPUT_SECTIONS.filter((s) => s.provenance_binding_required).map(
    (s) => s.section_id,
  );
}

/**
 * The runtime-provenance-bindings section's required_fragments: the OTHER bound section_ids
 * (every bound section except runtime-provenance-bindings itself), in bindings order. Derived
 * here so the load-bearing validated-text list cannot drift from the canonical set.
 */
export function runtimeProvenanceBindingsRequiredFragments(): string[] {
  return provenanceBindingSectionIds().filter(
    (id) => id !== FINAL_OUTPUT_SECTION_IDS.runtimeProvenanceBindings,
  );
}
