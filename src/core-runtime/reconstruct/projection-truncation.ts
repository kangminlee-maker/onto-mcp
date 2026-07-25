/**
 * Projection truncation — what the seed-stage prompt budget had to cut, recorded honestly.
 *
 * The three record kinds (document excerpt, workbook inventory, code inventory), the recompute
 * producers that derive them at projection time (so they reflect the actually-projected
 * observation — selection-filtered, redaction applied), and the eligibility predicates that decide
 * whether a projection is full-excerpt at all. Rendering these records into the final output is a
 * separate concern and stays with final-output assembly.
 */
import { projectCodeInventoryForPrompt } from "../code-structure-inventory-projection.js";
import type {
  CodeInventoryPromptProjectionResult,
} from "../code-structure-inventory-projection.js";
import type { CodeStructureInventory } from "../code-structure-observer.js";
import { projectInventoryForPrompt } from "../spreadsheet-structure-observer.js";
import type {
  WorkbookInventorySectionTruncation,
  WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";
import type { ReconstructSourceObservationsArtifact } from "./artifact-types.js";
import { isFullExcerptCaptureEligible } from "./materialize-preparation.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

/** A single document whose captured excerpt the seed-stage projection budget
 * sliced — its tail did not reach seed authoring. Detected at projection time (so
 * it reflects the actually-projected observation: selection-filtered and
 * source-safety redaction applied), deduped by the author, then recorded durably
 * and surfaced by runReconstruct. Exported for the regression test. */
export interface DocumentExcerptProjectionTruncation {
  observation_id: string;
  source_ref: string;
  // The bounded observation's material kind (code is now full-excerpt eligible too),
  // so the runtime event and final-output section name the right material instead of
  // always saying "document".
  target_material_kind: string;
  captured_chars: number;
  projection_budget_chars: number;
}

/** Sibling of DocumentExcerptProjectionTruncation for spreadsheets (P6): which
 *  inventory sections the seed-stage prompt projection bounded, and by how much. */
export interface WorkbookInventoryProjectionTruncation {
  observation_id: string;
  source_ref: string;
  sections: WorkbookInventorySectionTruncation[];
}

/**
 * Deterministically recompute which observations had their workbook inventory bounded
 * by the seed-stage prompt projection. Unlike the document excerpt projection — whose
 * truncation depends on the prompt-time single-document expand opt-in, so it needs a
 * per-call-site sink — the inventory projection is applied UNCONDITIONALLY
 * (compactStructuralDataForPrompt) and is a pure function of the inventory
 * (projectInventoryForPrompt). It is therefore fully recoverable from the persisted
 * observations, so no call-site sink is needed (and none can be missed — the C-recon
 * F1 trap). The selector here MIRRORS the projection site exactly: any observation
 * carrying a workbook_inventory OBJECT (no kind gate — only the spreadsheet observer
 * produces one, but matching the projection avoids a "bounded-but-unrecorded"
 * divergence). The persisted inventory stays full; this records only that the seed-stage
 * PROMPT saw a bounded view, so replay/audit is honest about it. Exported for the test.
 */
export function recomputeWorkbookInventoryProjectionTruncations(
  observations: readonly ReconstructSourceObservation[],
): WorkbookInventoryProjectionTruncation[] {
  const truncations: WorkbookInventoryProjectionTruncation[] = [];
  for (const observation of observations) {
    const inventory = observation.structural_data.workbook_inventory;
    if (
      inventory === null ||
      typeof inventory !== "object" ||
      Array.isArray(inventory)
    ) {
      continue;
    }
    const projection = projectInventoryForPrompt(
      inventory as WorkbookStructuralInventory,
      undefined,
      { includeValueTiles: true }, // P1-C1 #5: reconstruct prompts include the bounded value tile
    );
    if (projection.truncated) {
      truncations.push({
        observation_id: observation.observation_id,
        source_ref: observation.source_ref,
        sections: projection.sections,
      });
    }
  }
  return truncations;
}

/** P6 code twin: durable record that the seed-stage PROMPT saw a bounded code inventory. */
export interface CodeInventoryProjectionTruncation {
  observation_id: string;
  source_ref: string;
  sections: CodeInventoryPromptProjectionResult["sections"];
}

/**
 * Code twin of recomputeWorkbookInventoryProjectionTruncations: the code inventory prompt
 * projection is applied UNCONDITIONALLY (compactStructuralDataForPrompt) and is a pure
 * function of the inventory (projectCodeInventoryForPrompt), so the bounded observations are
 * fully recoverable from the persisted observations — no per-call-site sink, nothing to miss
 * on any path or on resume. The selector MIRRORS the projection site exactly: any observation
 * carrying a code_structure_inventory OBJECT (no kind gate — only the code observer produces
 * one, but matching the projection avoids a "bounded-but-unrecorded" divergence).
 */
export function recomputeCodeInventoryProjectionTruncations(
  observations: readonly ReconstructSourceObservation[],
): CodeInventoryProjectionTruncation[] {
  const truncations: CodeInventoryProjectionTruncation[] = [];
  for (const observation of observations) {
    const inventory = observation.structural_data.code_structure_inventory;
    if (
      inventory === null ||
      typeof inventory !== "object" ||
      Array.isArray(inventory)
    ) {
      continue;
    }
    const projection = projectCodeInventoryForPrompt(inventory as CodeStructureInventory);
    if (projection.truncated) {
      truncations.push({
        observation_id: observation.observation_id,
        source_ref: observation.source_ref,
        sections: projection.sections,
      });
    }
  }
  return truncations;
}

/**
 * Full-document excerpt expansion: a document observation projects its whole captured
 * prose instead of the bounded budget, so purpose/candidate/seed authoring reads the
 * document tail (goals, milestones) where actor/object evidence for seed-authoring
 * readiness lives. It is granted only when `expandDocument` holds, which the caller
 * (`observationPromptPayload`) computes as BOTH:
 *   - a seed-authoring prompt opted in (`expandSingleDocumentExcerpt`) — post-seed
 *     aggregate/validation prompts (claim realization, competency questions) and the
 *     bounded post-seed/directive catalogs do NOT opt in, even though several share the
 *     same numeric budget; and
 *   - the prompt projects a SINGLE observation — a multi-document bundle or a mixed
 *     directory (both already-accepted inputs) would otherwise multiply the bounded
 *     catalog into a context-overflowing prompt; and
 *   - the observation's content_excerpt holds the whole source text
 *     (`isFullExcerptProjectionEligible`: a text-readable document .md/.txt/.adoc,
 *     or code captured as text) — a binary document (.pdf/.docx) captured only the
 *     small structural sample, and spreadsheet/database carry a structural inventory
 *     rather than raw text, so those keep the bounded excerpt.
 * Multi-document / over-window budget-aware selection is deferred (see
 * development-records/design/20260616-large-input-observation).
 */
export function isFullExcerptProjectionEligible(
  targetMaterialKind: string | undefined,
  sourceRef: string | null | undefined,
): boolean {
  // Single shared whole-capture predicate (M3a): the capture owner
  // (materialize-preparation) and this seed-stage projection consult the SAME ref-based
  // eligibility, so a bounded capture can never sit under a whole-projection budget (which
  // would silently author the seed from a partial file). Source-language code (allowlisted
  // extension OR build-language basename) and text-readable documents earn the whole excerpt;
  // config/data code files, binary documents, and structural-inventory kinds stay bounded.
  return isFullExcerptCaptureEligible(targetMaterialKind, sourceRef);
}

/**
 * Design §7 (whole-document-projection generalization, PR-1b-3): true when every observation in
 * `observations` is a REGION of the SAME file — same `source_ref`, each carrying a distinct
 * `location` and a numeric `region_line_start`/`region_line_end` (the additive fields
 * `expandSourceObservationIntoRegions` stamps on a region observation — materialize-preparation.ts
 * — never present on a whole-file observation). A decomposed document projected as N region
 * observations qualifies for whole-document expansion exactly like a single whole-file observation
 * does under the existing `observations.length <= 1` gate: both are "one document's worth". A
 * multi-FILE bundle (mixed directory, several distinct documents) never qualifies (different
 * `source_ref`), so it keeps today's bounded per-observation excerpt unchanged.
 */
export function allObservationsAreRegionsOfOneFile(
  observations: readonly ReconstructSourceObservation[],
): boolean {
  if (observations.length <= 1) return false;
  const sourceRef = observations[0]!.source_ref;
  const locations = new Set<string>();
  for (const observation of observations) {
    if (observation.source_ref !== sourceRef) return false;
    if (
      typeof observation.structural_data.region_line_start !== "number" ||
      typeof observation.structural_data.region_line_end !== "number"
    ) {
      return false;
    }
    if (locations.has(observation.location)) return false;
    locations.add(observation.location);
  }
  return true;
}

/**
 * One observation's resume-fallback truncation record, or `[]` when the observation is not
 * full-excerpt-projection-eligible or its captured excerpt fits `budget`. Shared by both branches
 * of `singleDocumentProjectionTruncation` below so the single-observation and per-region cases
 * apply the identical eligibility + slicing rule.
 */
function singleObservationProjectionTruncation(
  observation: ReconstructSourceObservation,
  budget: number,
): DocumentExcerptProjectionTruncation[] {
  // Mirror the fresh-run eligibility (text-readable document OR source-language code, by ref
  // so build-language basenames count) so a resumed run records code truncation provenance
  // too — a document-only check silently dropped the event for a large single code file.
  if (
    !isFullExcerptProjectionEligible(
      observation.target_material_kind,
      observation.source_ref,
    )
  ) {
    return [];
  }
  const excerpt = observation.structural_data.content_excerpt;
  if (typeof excerpt !== "string" || excerpt.length <= budget) return [];
  return [
    {
      observation_id: observation.observation_id,
      source_ref: observation.source_ref,
      target_material_kind: observation.target_material_kind,
      captured_chars: excerpt.length,
      projection_budget_chars: budget,
    },
  ];
}

/**
 * Resume fallback for the projection-truncation record. On
 * `reuse_existing_authored_artifacts` the seed-authoring calls that populate the
 * author's truncation sink are skipped, so it is empty even though the reused
 * artifacts may have been authored from a budget-sliced prompt. This recomputes
 * the unambiguous SINGLE-document case from the already-projected observations
 * (`promptSourceObservations` — source-safety redaction already applied, so a
 * redacted document has no `content_excerpt` and is correctly not reported) and
 * the budget — UNCHANGED, so still byte-identical for an unsplit resume.
 *
 * Design §7 (PR-1b-3): a decomposed document's seed-stage snapshot holds N region
 * observations of the SAME file (`allObservationsAreRegionsOfOneFile`), the exact set the live
 * path (`observationPromptPayload`) also recognizes as "one document's worth" and budgets at
 * floor(budget/count) per region (mirrored here so a resumed run reports the SAME per-region
 * truncations a fresh run would have recorded). A genuine multi-FILE bundle (mixed directory,
 * several distinct documents) still recomputes nothing — deferred, same as before this PR;
 * the primary large-input scenario is a single document (whole-file or fully split into regions).
 * Exported for the regression test.
 */
export function singleDocumentProjectionTruncation(
  promptSourceObservations: ReconstructSourceObservationsArtifact,
  budget: number,
): DocumentExcerptProjectionTruncation[] {
  const observations = promptSourceObservations.observations;
  if (observations.length === 1) {
    return singleObservationProjectionTruncation(observations[0]!, budget);
  }
  if (!allObservationsAreRegionsOfOneFile(observations)) return [];
  const perRegionBudget = Math.floor(budget / observations.length);
  return observations.flatMap((observation) =>
    singleObservationProjectionTruncation(observation, perRegionBudget)
  );
}
