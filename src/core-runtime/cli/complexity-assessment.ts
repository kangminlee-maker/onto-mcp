/**
 * Phase 3: Step 1.5 Complexity Assessment — standalone LLM-based review mode selection.
 *
 * When `host_runtime` is standalone (no interactive host LLM session), the TS
 * process must decide `review_mode` (core-axis vs full) and select relevant
 * lenses by calling `main_llm` directly.
 *
 * Two-step process:
 *   1. Q2/Q3 assessment: cheap triggers to decide whether core-axis review
 *      (cost-constrained Pareto-optimal core lens set) is appropriate vs full 9-lens
 *   2. Lens selection: §7 Reverse Application to select relevant lenses
 *      (only if core-axis suggested)
 *
 * # When this is used
 *
 * - `host_runtime: standalone` AND `--review-mode` not explicitly set
 * - `host_runtime: standalone` AND `--review-mode core-axis` AND `--lens-id` not set
 *
 * # When this is NOT used
 *
 * - `host_runtime: claude` or `codex` → host session handles Step 1.5 interactively
 * - `--review-mode full` explicitly set → no assessment needed (9 lenses)
 * - `--lens-id` explicitly set → user override, no assessment
 *
 * # LLM provider
 *
 * Uses the canonical `llm` switcher from `.onto/settings.json`.
 */

import type { OntoConfig } from "../discovery/settings-chain.js";
import { loadCoreLensRegistry } from "../discovery/lens-registry.js";
import {
  callLlm,
  resolveLlmProviderConfig,
  type LlmCallConfig,
} from "../llm/llm-caller.js";

// Load core-axis composition from SSOT at module init — keeps prompt text
// and core-axis set in sync with .onto/authority/core-lens-registry.yaml (v0.2.1:
// 6 cost-constrained Pareto-optimal lenses).
const CORE_LENS_REGISTRY = loadCoreLensRegistry();
const CORE_AXIS_LENS_IDS = CORE_LENS_REGISTRY.core_axis_lens_ids;
const CORE_AXIS_LENS_DESC = CORE_AXIS_LENS_IDS.join(", ");
const CORE_AXIS_LENS_COUNT = CORE_AXIS_LENS_IDS.length;
const MIN_LENS_SELECTION = 2;
const MAX_LENS_SELECTION = CORE_AXIS_LENS_COUNT;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplexityAssessmentResult {
  suggestCoreAxis: boolean;
  q2Rationale: string;
  q3Rationale: string;
}

export interface LensSelectionResult {
  selectedLensIds: string[];
  rationale: string;
}

// ---------------------------------------------------------------------------
// LLM config resolution for main_llm
// ---------------------------------------------------------------------------

function resolveMainLlmConfig(ontoConfig: OntoConfig): Partial<LlmCallConfig> {
  return resolveLlmProviderConfig({ config: ontoConfig, cliOverrides: {} });
}

// ---------------------------------------------------------------------------
// Q2/Q3 Complexity Assessment
// ---------------------------------------------------------------------------

const COMPLEXITY_SYSTEM_PROMPT = `You are a review complexity assessor. You will be given a review target description and must answer two questions to determine whether a core-axis review (cost-constrained Pareto-optimal ${CORE_AXIS_LENS_COUNT} lenses: ${CORE_AXIS_LENS_DESC}) is appropriate vs a full 9-lens review.

Answer in JSON format:
{
  "q2_cross_verification_secondary": true/false,
  "q2_rationale": "...",
  "q3_miss_risk_acceptable": true/false,
  "q3_rationale": "...",
  "suggest_core_axis": true/false
}

Q2: Is cross-verification between multiple review dimensions secondary (not critical)?
- Cross-verification IS critical for: system-wide design changes, multi-file modifications, new concept introduction
- Cross-verification IS secondary for: single-perspective judgment, existing design modifications, documentation accuracy checks

Q3: Is the risk of missing a finding acceptable?
- Risk is HIGH for: pre-implementation final verification, safety mechanism design, changes affecting existing users
- Risk is LOW for: exploratory questions, early direction setting, internal documentation, post-review follow-up checks

suggest_core_axis = true only if BOTH q2 AND q3 are true.`;

export async function assessComplexity(
  targetDescription: string,
  reviewIntent: string,
  ontoConfig: OntoConfig,
): Promise<ComplexityAssessmentResult> {
  const llmConfig = resolveMainLlmConfig(ontoConfig);

  const userPrompt = `Review target: ${targetDescription}\n\nReview intent: ${reviewIntent}\n\nAssess the complexity of this review target.`;

  const result = await callLlm(COMPLEXITY_SYSTEM_PROMPT, userPrompt, {
    ...llmConfig,
    max_tokens: llmConfig.max_tokens ?? 512,
  });

  try {
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { suggestCoreAxis: false, q2Rationale: "JSON parse failed — defaulting to full", q3Rationale: "" };
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      q2_cross_verification_secondary?: boolean;
      q2_rationale?: string;
      q3_miss_risk_acceptable?: boolean;
      q3_rationale?: string;
      suggest_core_axis?: boolean;
    };

    return {
      suggestCoreAxis: parsed.suggest_core_axis === true,
      q2Rationale: parsed.q2_rationale ?? "",
      q3Rationale: parsed.q3_rationale ?? "",
    };
  } catch {
    // Parse failure → default to full review.
    return { suggestCoreAxis: false, q2Rationale: "JSON parse failed — defaulting to full", q3Rationale: "" };
  }
}

// ---------------------------------------------------------------------------
// Lens Selection (§7 Reverse Application)
// ---------------------------------------------------------------------------

const LENS_SELECTION_SYSTEM_PROMPT = `You are a review lens selector. Given a review target, select which review lenses are most relevant.

Available lenses (select ${MIN_LENS_SELECTION}-${MAX_LENS_SELECTION} from this list):
- logic: Logical consistency — contradictions, type conflicts, constraint clashes
- structure: Structural completeness — isolated elements, broken paths, missing relations
- dependency: Dependency integrity — circular, reverse, diamond dependencies
- semantics: Semantic accuracy — name-meaning alignment, synonyms/homonyms
- pragmatics: Pragmatic fitness — queryability, competency question testing
- evolution: Evolution fitness — breakage on new data/domain addition
- coverage: Domain coverage — missing subdomains, concept bias, gaps
- conciseness: Conciseness — duplicate definitions, over-specification
- axiology: Purpose and value alignment — purpose drift, value conflicts (ALWAYS INCLUDE)

Answer in JSON format:
{
  "selected_lens_ids": ["axiology", "logic", ...],
  "rationale": "..."
}

Rules:
- ALWAYS include "axiology" (purpose alignment is mandatory for every review)
- Select ${MIN_LENS_SELECTION}-${MAX_LENS_SELECTION} lenses total (including axiology)
- Choose lenses whose verification dimension is most relevant to the target
- Prefer fewer lenses when the target is narrow in scope`;

export async function selectLenses(
  targetDescription: string,
  reviewIntent: string,
  ontoConfig: OntoConfig,
): Promise<LensSelectionResult> {
  const llmConfig = resolveMainLlmConfig(ontoConfig);

  const userPrompt = `Review target: ${targetDescription}\n\nReview intent: ${reviewIntent}\n\nSelect the most relevant review lenses.`;

  const result = await callLlm(LENS_SELECTION_SYSTEM_PROMPT, userPrompt, {
    ...llmConfig,
    max_tokens: llmConfig.max_tokens ?? 512,
  });

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { selectedLensIds: [...CORE_AXIS_LENS_IDS], rationale: "JSON parse failed — using default core-axis set" };
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      selected_lens_ids?: string[];
      rationale?: string;
    };

    const validLenses = CORE_LENS_REGISTRY.full_review_lens_ids;
    const selectedIds = (parsed.selected_lens_ids ?? []).filter((id) => validLenses.includes(id));

    // Ensure always_include lenses are present (axiology, per registry)
    for (const mandatory of CORE_LENS_REGISTRY.always_include_lens_ids) {
      if (!selectedIds.includes(mandatory)) {
        selectedIds.push(mandatory);
      }
    }

    if (selectedIds.length < MIN_LENS_SELECTION) {
      return { selectedLensIds: [...CORE_AXIS_LENS_IDS], rationale: "Too few valid lenses selected — using default core-axis set" };
    }

    return {
      selectedLensIds: selectedIds,
      rationale: parsed.rationale ?? "",
    };
  } catch {
    return { selectedLensIds: [...CORE_AXIS_LENS_IDS], rationale: "JSON parse failed — using default core-axis set" };
  }
}
