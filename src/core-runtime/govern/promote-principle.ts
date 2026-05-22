/**
 * govern promote-principle — Knowledge → Principle 승격 제안 (W-C-03 v0).
 *
 * 승격 기준 4 gate:
 *   - Completeness gate: proposal schema 필수 필드 전수
 *   - Quality gate: workload-evidence (events.ndjson 에서 집계된 지표 OR threshold)
 *   - Frequency gate: similar_to 가 기존 pending 참조 시 workload evidence 면제 (2번째부터)
 *   - Principal gate: queue verdict recorded through the govern adapter
 *
 * v0 bounded minimum surface: 기록만. decide approve 후 실제 파일 편집은 주체자 수동.
 */

import { existsSync, readFileSync } from "node:fs";
import {
  join,
  isAbsolute as isAbsolutePath,
  relative as relativePath,
  resolve as resolvePath,
} from "node:path";
import {
  appendQueueEvent,
  generateGovernId,
  projectQueue,
  readQueueEvents,
  resolveQueuePath,
} from "./queue.js";
import type { GovernSubmitEvent } from "./types.js";
import { startsWithDirPrefix } from "../discovery/path-normalization.js";

export interface WorkloadEvidence {
  state_transitions?: number;
  constraint_count?: number;
  retry_count?: number;
  evidence_summary: string;
  event_refs: string[];
}

export interface ConflictCheck {
  reviewed_by_agent: boolean;
  existing_principle_refs: string[];
  conflict_summary: string;
}

export interface PromotePrincipleProposal {
  learning_ref: {
    agent_id: string;
    entry_marker: string;
  };
  /**
   * `category` names the seat the proposal targets. Phase 7 (2026-04-21)
   * renamed `design_principle` → `principle` so the label matches its
   * referent set (`.onto/principles/*` hosts principles, guidelines, and
   * charters — all of which are "principle documents" in the broad sense).
   *
   *   category="principle" → accepts `.onto/principles/*`.
   *   category="process"   → accepts `.onto/processes/*`.
   */
  target: {
    category: "principle" | "process";
    file_path: string;
    section: string;
  };
  rationale: string;
  conflict_check: ConflictCheck;
  workload_evidence: WorkloadEvidence;
  source_impact: "high" | "normal";
  similar_to?: string[];
}

export interface WorkloadThresholds {
  mode: "any" | "all";
  state_transitions_min: number;
  constraint_count_min: number;
  retry_count_min: number;
  repeat_observation_min: number;
}

const DEFAULT_THRESHOLDS: WorkloadThresholds = {
  mode: "any",
  state_transitions_min: 8,
  constraint_count_min: 3,
  retry_count_min: 2,
  repeat_observation_min: 1,
};

export interface PromotePrincipleResult {
  success: true;
  id: string;
  similar_to: string[];
  gate_passed: "quality" | "frequency";
}

export interface PromotePrincipleFailure {
  success: false;
  reason: string;
  gate_failed?: "quality" | "completeness" | "validation";
}

export type PromotePrincipleOutput = PromotePrincipleResult | PromotePrincipleFailure;

export function readThresholds(projectRoot: string): WorkloadThresholds {
  const configPath = join(projectRoot, ".onto", "govern", "thresholds.yaml");
  if (!existsSync(configPath)) return { ...DEFAULT_THRESHOLDS };
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseSimpleYaml(raw);
    return {
      mode: parsed.mode === "all" ? "all" : "any",
      state_transitions_min: Number(parsed.state_transitions_min) || DEFAULT_THRESHOLDS.state_transitions_min,
      constraint_count_min: Number(parsed.constraint_count_min) || DEFAULT_THRESHOLDS.constraint_count_min,
      retry_count_min: Number(parsed.retry_count_min) || DEFAULT_THRESHOLDS.retry_count_min,
      repeat_observation_min: Number(parsed.repeat_observation_min) || DEFAULT_THRESHOLDS.repeat_observation_min,
    };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

function parseSimpleYaml(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && val) result[key] = val;
  }
  return result;
}

function passesQualityGate(
  evidence: WorkloadEvidence,
  thresholds: WorkloadThresholds,
): boolean {
  const checks = [
    (evidence.state_transitions ?? 0) >= thresholds.state_transitions_min,
    (evidence.constraint_count ?? 0) >= thresholds.constraint_count_min,
    (evidence.retry_count ?? 0) >= thresholds.retry_count_min,
  ];
  return thresholds.mode === "any"
    ? checks.some(Boolean)
    : checks.every(Boolean);
}

function passesFrequencyGate(
  similarTo: string[] | undefined,
  pendingIds: Set<string>,
  thresholds: WorkloadThresholds,
): boolean {
  if (!similarTo || similarTo.length === 0) return false;
  const validRefs = similarTo.filter((id) => pendingIds.has(id));
  return validRefs.length >= thresholds.repeat_observation_min;
}

export function executePromotePrinciple(
  proposal: PromotePrincipleProposal,
  projectRoot: string,
  now: Date = new Date(),
): PromotePrincipleOutput {
  // Completeness gate
  if (!proposal.learning_ref?.agent_id || !proposal.learning_ref?.entry_marker) {
    return { success: false, reason: "learning_ref.agent_id 와 entry_marker 필수.", gate_failed: "completeness" };
  }
  const validCategories = ["principle", "process"];
  const rawCategory = (proposal.target?.category ?? "") as string;
  // Missing required fields → completeness gate.
  if (!proposal.target?.file_path || !proposal.target?.section || rawCategory.length === 0) {
    return {
      success: false,
      reason: "target.file_path, section, category (principle|process) 필수.",
      gate_failed: "completeness",
    };
  }
  // Field present but value invalid → validation gate.
  if (!validCategories.includes(rawCategory)) {
    const hint =
      rawCategory === "design_principle"
        ? " (legacy label 'design_principle' was renamed to 'principle' in Phase 7)"
        : "";
    return {
      success: false,
      reason: `target.category '${rawCategory}' 는 허용되지 않음. 허용: principle | process.${hint}`,
      gate_failed: "validation",
    };
  }
  if (!proposal.rationale || proposal.rationale.trim().length === 0) {
    return { success: false, reason: "rationale 필수.", gate_failed: "completeness" };
  }
  if (!proposal.conflict_check || typeof proposal.conflict_check.conflict_summary !== "string") {
    return { success: false, reason: "conflict_check (reviewed_by_agent, existing_principle_refs, conflict_summary) 필수.", gate_failed: "completeness" };
  }
  if (!proposal.workload_evidence || !proposal.workload_evidence.evidence_summary) {
    return { success: false, reason: "workload_evidence.evidence_summary 필수.", gate_failed: "completeness" };
  }

  // Target validation — seat integrity check.
  //
  // Phase 7 (2026-04-21) removed legacy-layout acceptance. Only canonical
  // `.onto/principles/*` or `.onto/processes/*` are valid targets.
  //
  // `principle` category maps to the full `.onto/principles/` set (which
  // houses principles, guidelines, and charters).
  //
  // Two-stage defense:
  //   1. Lexical segment-bound check — rejects near-miss directory names
  //      (`.onto/principlesABC/foo.md`) without touching the filesystem.
  //   2. Normalized-descendant check — rejects traversal-shaped inputs
  //      (`.onto/principles/../../etc/passwd`) that would pass the lexical
  //      check but, after `path.resolve`, land outside the canonical dir.
  //      This is path-seat containment on the normalized string, not
  //      symlink-aware `realpath` containment — symlink escape is out of
  //      scope within the current threat model (proposals are internal,
  //      not arbitrary user-supplied paths).
  const canonicalDir =
    proposal.target.category === "principle"
      ? ".onto/principles"
      : ".onto/processes";
  const rawPath = proposal.target.file_path;
  const lexicalPass = startsWithDirPrefix(rawPath, canonicalDir);
  let canonicalPass = false;
  if (lexicalPass) {
    const resolvedAbs = resolvePath(projectRoot, rawPath);
    const canonicalAbs = resolvePath(projectRoot, canonicalDir);
    const rel = relativePath(canonicalAbs, resolvedAbs);
    canonicalPass = rel.length > 0 && !rel.startsWith("..") && !isAbsolutePath(rel);
  }
  if (!lexicalPass || !canonicalPass) {
    return {
      success: false,
      reason: `target.file_path '${rawPath}' 가 category '${proposal.target.category}' 에 맞는 디렉토리 (${canonicalDir}/) 에 속하지 않음.`,
      gate_failed: "validation",
    };
  }

  // Read thresholds + pending queue
  const thresholds = readThresholds(projectRoot);
  const queuePath = resolveQueuePath(projectRoot);
  const events = readQueueEvents(queuePath);
  const entries = projectQueue(events);
  const pendingIds = new Set(entries.filter((e) => e.status === "pending").map((e) => e.id));

  // similar_to validation
  const similarTo = proposal.similar_to ?? [];
  for (const refId of similarTo) {
    if (!pendingIds.has(refId)) {
      return {
        success: false,
        reason: `similar_to 의 '${refId}' 가 pending queue 에 존재하지 않음.`,
        gate_failed: "validation",
      };
    }
  }

  // Quality gate OR Frequency gate
  const qualityPass = passesQualityGate(proposal.workload_evidence, thresholds);
  const frequencyPass = passesFrequencyGate(proposal.similar_to, pendingIds, thresholds);
  let gatePassed: "quality" | "frequency";

  if (qualityPass) {
    gatePassed = "quality";
  } else if (frequencyPass) {
    gatePassed = "frequency";
  } else {
    const t = thresholds;
    return {
      success: false,
      reason: `Quality gate 미충족 (threshold: state_transitions≥${t.state_transitions_min}, constraint_count≥${t.constraint_count_min}, retry_count≥${t.retry_count_min}, mode=${t.mode}). Frequency gate 도 미충족 (similar_to pending ${similarTo.length}건, 필요 ${t.repeat_observation_min}건).`,
      gate_failed: "quality",
    };
  }

  // Queue append. Phase 7 removed legacy-prefix canonicalization since
  // validation now rejects anything outside `.onto/…` — the raw input is
  // already canonical by construction.
  const id = generateGovernId(now);
  const event: GovernSubmitEvent = {
    type: "submit",
    id,
    origin: "human",
    tag: "norm_change",
    target: proposal.target.file_path,
    payload: {
      promotion_kind: "knowledge_to_principle",
      proposal,
      gate_passed: gatePassed,
    },
    submitted_at: now.toISOString(),
    submitted_by: "principal",
  };

  appendQueueEvent(queuePath, event);

  return {
    success: true,
    id,
    similar_to: similarTo,
    gate_passed: gatePassed,
  };
}
