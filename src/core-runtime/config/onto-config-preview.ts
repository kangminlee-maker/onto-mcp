/**
 * Review UX Redesign P5 — `onto config validate` / `onto config show`
 * preview helper.
 *
 * # What this module is
 *
 * A pure function that takes a validated `OntoReviewConfig` + host signals
 * and returns a deterministic textual preview showing:
 *   (a) which topology shape the config would derive to,
 *   (b) which canonical `TopologyId` that shape would map to under the
 *       current environment, and
 *   (c) the exact validation or mapping point that would stop execution.
 *
 * # Why it exists
 *
 * The onboard + config-edit UX promise is "what you configured is what
 * runs". Without a preview step, users only see the runtime outcome after
 * starting a review (via the `[topology]` STDERR trace). This helper
 * surfaces the derivation BEFORE any review call, making config-time and
 * run-time answer the same question with the same inputs.
 *
 * # How it relates
 *
 * - Input: validated `OntoReviewConfig` (from `validateReviewConfig`) +
 *   detected axes (from `detectReviewAxes`).
 * - Output: a typed `Preview` object (topology id, shape) plus
 *   a rendered string for CLI display.
 * - Shares derivation/mapping logic with `resolveAxisFirstTopology` so
 *   the preview and the runtime can never drift.
 */

import type { OntoReviewConfig } from "../discovery/config-chain.js";
import type { TopologyId } from "../review/execution-topology-resolver.js";
import { shapeToTopologyId } from "../review/shape-to-topology-id.js";
import {
  deriveTopologyShape,
  type ShapeDerivationSignals,
  type TopologyShape,
} from "../review/topology-shape-derivation.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PreviewSignals extends ShapeDerivationSignals {
  /** For mapping stage — passed through to `shapeToTopologyId`. */
  codexSessionActive: boolean;
}

export interface PreviewSuccess {
  ok: true;
  /** Shape actually derived (post-degrade if a degrade happened). */
  shape: TopologyShape;
  /** Canonical TopologyId the runtime would dispatch to. */
  topology_id: TopologyId;
  /** Human-readable rationale for each step (derivation → mapping). */
  trace: string[];
}

export interface PreviewFailure {
  ok: false;
  /** Reason the preview cannot produce a TopologyId. */
  reason: string;
  trace: string[];
}

export type PreviewResult = PreviewSuccess | PreviewFailure;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Run derivation + mapping preview. Mirrors the
 * runtime resolver's axis-first path so the output matches what the user
 * would see in `[topology]` STDERR during a real review invocation.
 */
export function previewTopologyDerivation(
  config: OntoReviewConfig,
  signals: PreviewSignals,
): PreviewResult {
  const trace: string[] = [];

  const derivation = deriveTopologyShape(config, signals);
  for (const line of derivation.ok ? derivation.derived.trace : derivation.trace) {
    trace.push(`derive: ${line}`);
  }

  if (!derivation.ok) {
    return {
      ok: false,
      reason: derivation.reasons[0] ?? "topology shape derivation failed",
      trace,
    };
  }

  const mapping = shapeToTopologyId({
    shape: derivation.derived.shape,
    subagent_provider: derivation.derived.subagent_provider,
    signals: {
      claudeHost: signals.claudeHost,
      codexSessionActive: signals.codexSessionActive,
    },
  });
  for (const line of mapping.trace) {
    trace.push(`map: ${line}`);
  }

  if (!mapping.ok) {
    return {
      ok: false,
      reason: mapping.reason,
      trace,
    };
  }

  trace.push(`result: shape=${derivation.derived.shape} topology=${mapping.topology_id}`);
  return {
    ok: true,
    shape: derivation.derived.shape,
    topology_id: mapping.topology_id,
    trace,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render a preview result as a human-readable block for CLI display.
 * Handles both success and failure outputs. Keep the format stable — the
 * onboard prose and `onto config` output use the same template so the
 * user learns one visual vocabulary.
 */
export function renderPreview(result: PreviewResult): string {
  const lines: string[] = [];
  if (result.ok) {
    lines.push("## Topology derivation preview");
    lines.push("");
    lines.push(`  shape:        ${result.shape}`);
    lines.push(`  topology_id:  ${result.topology_id}`);
  } else {
    lines.push("## Topology derivation preview — FAILED");
    lines.push("");
    lines.push(`  reason: ${result.reason}`);
  }
  lines.push("");
  lines.push("  Trace:");
  for (const line of result.trace) {
    lines.push(`    ${line}`);
  }
  return lines.join("\n");
}
