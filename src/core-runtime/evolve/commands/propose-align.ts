/**
 * Evolve propose-align — transition grounded → align_proposed.
 *
 * Consumes consolidated dialog output (direction, scope, constraints, tensions)
 * from the agent who conducted the Principal dialog, then:
 *   1. Emits constraint.discovered events (pool registration).
 *   2. Renders build/align-packet.md.
 *   3. Emits align.proposed event (state transition to align_proposed).
 *
 * The agent owns UX (selection-based choices, natural-language fallback,
 * inquiry consolidation, convergence judgment); this CLI owns the bounded
 * state machine + event log + packet rendering.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readEvents } from "../../scope-runtime/event-store.js";
import { reduce } from "../../scope-runtime/reducer.js";
import { appendScopeEvent } from "../../scope-runtime/event-pipeline.js";
import { renderAlignPacket } from "../renderers/align-packet.js";
import type { ScopePaths } from "../../scope-runtime/scope-manager.js";
import type { AlignPacketContent } from "../../scope-runtime/types.js";

// ─── Input schema ───

const constraintInputSchema = z.object({
  summary: z.string().min(1),
  perspective: z.enum(["experience", "code", "policy"]),
  severity: z.enum(["required", "recommended"]),
  decision_owner: z.enum(["product_owner", "builder"]),
  impact_if_ignored: z.string().min(1),
  source_refs: z
    .array(z.object({ source: z.string(), detail: z.string() }))
    .default([]),
  evidence_status: z
    .enum(["verified", "code_inferred", "brief_claimed", "unverified"])
    .optional(),
  evidence_note: z.string().optional(),
  why_conflict: z.string().min(1),
  scale: z.string().min(1),
  options: z
    .array(
      z.object({
        choice: z.string(),
        pros: z.string(),
        risk: z.string(),
        detail: z.string().optional(),
      }),
    )
    .optional(),
  recommendation: z.string().optional(),
});

const proposeAlignInputSchema = z.object({
  interpreted_direction: z.string().min(1),
  proposed_scope: z.object({
    in: z.array(z.string()).min(1),
    out: z.array(z.string()),
  }),
  scenarios: z.array(z.string()).default([]),
  as_is: z.object({
    experience: z.string().default(""),
    policy: z.string().default(""),
    code: z.string().default(""),
    code_details: z.string().optional(),
  }),
  constraints: z.array(constraintInputSchema).default([]),
  decision_questions: z.array(z.string()).default([]),
  interface_extras: z
    .object({
      api_scope: z.string(),
      breaking_change: z.string(),
      version_policy: z.string(),
    })
    .optional(),
});

export type ProposeAlignInput = z.infer<typeof proposeAlignInputSchema>;

// ─── Output ───

export interface ProposeAlignResult {
  success: true;
  scope_id: string;
  constraints_registered: number;
  packet_path: string;
  packet_hash: string;
  next_state: string;
  next_action: string;
}

export interface ProposeAlignFailure {
  success: false;
  reason: string;
}

export type ProposeAlignOutput = ProposeAlignResult | ProposeAlignFailure;

// ─── Main ───

export function executeProposeAlign(
  paths: ScopePaths,
  jsonInput: string,
): ProposeAlignOutput {
  // Step 1: Parse + validate input
  let parsed: ProposeAlignInput;
  try {
    const raw = JSON.parse(jsonInput);
    const result = proposeAlignInputSchema.safeParse(raw);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return {
        success: false,
        reason: `Invalid propose-align input: ${issues}`,
      };
    }
    parsed = result.data;
  } catch (e) {
    return {
      success: false,
      reason: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Step 2: Verify current state is grounded
  const initialEvents = readEvents(paths.events);
  const initialState = reduce(initialEvents);
  if (initialState.current_state !== "grounded") {
    return {
      success: false,
      reason: `현재 상태가 ${initialState.current_state}입니다. propose-align은 grounded 상태에서만 실행할 수 있습니다.`,
    };
  }

  // Step 3: Emit constraint.discovered events
  const tensions: AlignPacketContent["tensions"] = [];
  let registeredCount = 0;
  for (let i = 0; i < parsed.constraints.length; i++) {
    const c = parsed.constraints[i]!;
    const constraintId = `C-${String(i + 1).padStart(3, "0")}`;
    const payload: Record<string, unknown> = {
      constraint_id: constraintId,
      perspective: c.perspective,
      summary: c.summary,
      severity: c.severity,
      discovery_stage: "grounding",
      decision_owner: c.decision_owner,
      impact_if_ignored: c.impact_if_ignored,
      source_refs: c.source_refs,
    };
    if (c.evidence_status) payload.evidence_status = c.evidence_status;
    if (c.evidence_note) payload.evidence_note = c.evidence_note;

    const result = appendScopeEvent(paths, {
      type: "constraint.discovered",
      actor: "user",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
    });
    if (!result.success) {
      return {
        success: false,
        reason: `constraint.discovered[${i}] (${constraintId}) emission 실패: ${result.reason}`,
      };
    }
    registeredCount++;

    const tension: AlignPacketContent["tensions"][number] = {
      constraint_id: constraintId,
      what: c.summary,
      why_conflict: c.why_conflict,
      scale: c.scale,
    };
    if (c.options) {
      tension.options = c.options.map((o) => {
        const base: { choice: string; pros: string; risk: string; detail?: string } = {
          choice: o.choice,
          pros: o.pros,
          risk: o.risk,
        };
        if (o.detail !== undefined) base.detail = o.detail;
        return base;
      });
    }
    if (c.recommendation) tension.recommendation = c.recommendation;
    tensions.push(tension);
  }

  // Step 4: Re-read state after constraint events
  const stateAfterConstraints = reduce(readEvents(paths.events));

  // Step 5: Build AlignPacketContent
  const asIs: AlignPacketContent["as_is"] = {
    experience: parsed.as_is.experience,
    policy: parsed.as_is.policy,
    code: parsed.as_is.code,
  };
  if (parsed.as_is.code_details !== undefined) {
    asIs.code_details = parsed.as_is.code_details;
  }
  const content: AlignPacketContent = {
    user_original_text: stateAfterConstraints.title,
    interpreted_direction: parsed.interpreted_direction,
    proposed_scope: parsed.proposed_scope,
    scenarios: parsed.scenarios,
    as_is: asIs,
    tensions,
    decision_questions: parsed.decision_questions,
    ...(parsed.interface_extras
      ? { interface_extras: parsed.interface_extras }
      : {}),
  };

  // Step 6: Render packet
  let packetMd: string;
  try {
    packetMd = renderAlignPacket(stateAfterConstraints, content);
  } catch (e) {
    return {
      success: false,
      reason: `renderAlignPacket 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const packetPath = join(paths.build, "align-packet.md");
  writeFileSync(packetPath, packetMd, "utf-8");

  // Step 7: Compute packet hash
  const packetHash = createHash("sha256").update(packetMd).digest("hex");

  // Step 8: Emit align.proposed
  const proposeResult = appendScopeEvent(paths, {
    type: "align.proposed",
    actor: "user",
    payload: {
      packet_path: "build/align-packet.md",
      packet_hash: packetHash,
      snapshot_revision: stateAfterConstraints.snapshot_revision,
    },
  });
  if (!proposeResult.success) {
    return {
      success: false,
      reason: `align.proposed emission 실패: ${proposeResult.reason}`,
    };
  }

  return {
    success: true,
    scope_id: paths.scopeId,
    constraints_registered: registeredCount,
    packet_path: packetPath,
    packet_hash: packetHash,
    next_state: proposeResult.next_state,
    next_action:
      "build/align-packet.md 를 검토하고 bounded evolve align input을 제출하세요 (verdict type: approve/revise/reject/redirect).",
  };
}
