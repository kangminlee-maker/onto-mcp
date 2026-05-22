/**
 * govern runtime adapter (W-C-01, bounded minimum surface v0).
 *
 * Subcommands: submit / list / decide (queue pattern).
 *
 * Responsibility split (consistent with evolve propose-align precedent):
 *   - runtime adapter owns: queue I/O, event log append, deterministic projection, table/JSON rendering.
 *   - LLM / agent owns: proposal authoring (payload JSON assembly), judgment reasoning.
 *
 * v0 scope: 기록만. decide approve 후 authority 파일 실제 반영은 주체자 수동 편집 or W-C-02.
 * 승인 강제 차단 (pre-commit/CI/merge gate) 도 W-C-02.
 */

import {
  appendQueueEvent,
  generateGovernId,
  projectQueue,
  readQueueEvents,
  resolveQueuePath,
} from "./queue.js";
import { routeProposal } from "./drift-engine.js";
import type { ChangeKind, ChangeProposal } from "./drift-engine.js";
import { executePromotePrinciple } from "./promote-principle.js";
import type { PromotePrincipleProposal } from "./promote-principle.js";
import { originToTag } from "./types.js";
import type {
  GovernDecideEvent,
  GovernOrigin,
  GovernQueueEntry,
  GovernSubmitEvent,
  GovernVerdict,
} from "./types.js";

export async function handleGovernCli(
  _ontoHome: string,
  argv: string[],
): Promise<number> {
  const subcommand = argv[0];
  const subArgv = argv.slice(1);

  switch (subcommand) {
    case "submit":
      return handleSubmit(subArgv);
    case "list":
      return handleList(subArgv);
    case "decide":
      return handleDecide(subArgv);
    case "route":
      return handleRoute(subArgv);
    case "promote-principle":
      return handlePromotePrinciple(subArgv);
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return 0;
    default:
      console.error(`[onto] Unknown govern adapter subcommand: ${subcommand}`);
      console.error("Use the govern runtime adapter help for usage.");
      return 1;
  }
}

function printHelp(): void {
  console.log(
    [
      "Usage: govern-adapter <subcommand> [options]",
      "",
      "Subcommands:",
      "  submit   Queue a norm-change proposal or drift-detection item",
      "  list     Show queue entries (pending / decided / all)",
      "  decide   Record Principal verdict on a queued item",
      "  route    Classify a change proposal by drift policy (W-C-02, §1.3)",
      "  promote-principle  Propose a promoted learning for principle promotion (W-C-03)",
      "",
      "Options (submit):",
      "  --origin <human|system>     who is submitting (required)",
      "  --target <path>             file/resource being proposed to change (required)",
      "  --json <payload-json>       proposal payload JSON (required)",
      "  --prompted-by-drift <id>    optional: this human proposal was prompted by a drift item",
      "  --submitted-by <actor>      optional actor label (default: 'principal' for human, 'drift-engine' for system)",
      "  --project-root <path>       project root (default: cwd)",
      "",
      "Options (list):",
      "  --status <pending|decided|all>   filter (default: pending)",
      "  --format <table|json>            output format (default: table)",
      "  --project-root <path>            project root (default: cwd)",
      "",
      "Options (decide):",
      "  <id>                        queue entry id (positional, required)",
      "  --verdict <approve|reject>  required",
      "  --reason <text>             required",
      "  --decided-by <actor>        optional (default: principal)",
      "  --project-root <path>       project root (default: cwd)",
      "",
      "Options (route):",
      "  --json <proposal-json>                          required. ChangeProposal JSON (summary, target_files, change_kind, rationale?)",
      "  --project-root <path>                           project root (default: cwd)",
      "  (outcome routes)",
      "    self_apply        drift-free local change. no queue append. caller logs only.",
      "    queue             drift-risk change. appends origin=system, tag=drift to queue.",
      "    principal_direct  governance-core change. appends with payload marker route=principal_direct.",
      "",
      "v0 scope (bounded minimum surface):",
      "  - submit appends to .onto/govern/queue.ndjson (event-sourced, append-only).",
      "  - decide records verdict only. Actual authority-file edit after approve is",
      "    manual (or delegated to W-C-02 drift-engine). No merge/CI gate in v0.",
      "  - origin→tag is deterministic: human→norm_change, system→drift.",
      "  - Cross-project norms (e.g., global meta-rules) are out of scope; see W-C-03.",
    ].join("\n"),
  );
}

function readOption(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

function resolveProjectRoot(argv: string[]): string {
  return readOption(argv, "project-root") ?? process.cwd();
}

// ─── submit ───

function handleSubmit(argv: string[]): number {
  const originRaw = readOption(argv, "origin");
  const target = readOption(argv, "target");
  const jsonRaw = readOption(argv, "json");
  const promptedBy = readOption(argv, "prompted-by-drift");
  const submittedByOverride = readOption(argv, "submitted-by");

  if (!originRaw || (originRaw !== "human" && originRaw !== "system")) {
    console.error("[onto] govern submit: --origin must be 'human' or 'system'.");
    return 1;
  }
  if (!target) {
    console.error("[onto] govern submit: --target is required.");
    return 1;
  }
  if (!jsonRaw) {
    console.error("[onto] govern submit: --json payload is required.");
    return 1;
  }
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(jsonRaw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.error("[onto] govern submit: --json must be a JSON object.");
      return 1;
    }
    payload = parsed as Record<string, unknown>;
  } catch (e) {
    console.error(
      `[onto] govern submit: --json parse error: ${e instanceof Error ? e.message : String(e)}`,
    );
    return 1;
  }

  const origin = originRaw as GovernOrigin;
  const tag = originToTag(origin);
  const projectRoot = resolveProjectRoot(argv);
  const queuePath = resolveQueuePath(projectRoot);
  const id = generateGovernId();
  const submittedBy =
    submittedByOverride ?? (origin === "human" ? "principal" : "drift-engine");

  const event: GovernSubmitEvent = {
    type: "submit",
    id,
    origin,
    tag,
    target,
    payload,
    submitted_at: new Date().toISOString(),
    submitted_by: submittedBy,
  };
  if (promptedBy !== undefined) event.prompted_by_drift_id = promptedBy;

  appendQueueEvent(queuePath, event);

  console.log(
    JSON.stringify(
      {
        status: "queued",
        id,
        origin,
        tag,
        target,
        next_action: "govern MCP design pending; inspect the queue artifact before deciding",
      },
      null,
      2,
    ),
  );
  return 0;
}

// ─── list ───

function handleList(argv: string[]): number {
  const statusFilterRaw = readOption(argv, "status") ?? "pending";
  if (
    statusFilterRaw !== "pending" &&
    statusFilterRaw !== "decided" &&
    statusFilterRaw !== "all"
  ) {
    console.error(
      "[onto] govern list: --status must be 'pending', 'decided', or 'all'.",
    );
    return 1;
  }
  const format = readOption(argv, "format") ?? "table";
  if (format !== "table" && format !== "json") {
    console.error("[onto] govern list: --format must be 'table' or 'json'.");
    return 1;
  }

  const projectRoot = resolveProjectRoot(argv);
  const queuePath = resolveQueuePath(projectRoot);
  const events = readQueueEvents(queuePath);
  const entries = projectQueue(events);
  const filtered =
    statusFilterRaw === "all"
      ? entries
      : entries.filter((e) => e.status === statusFilterRaw);

  if (format === "json") {
    console.log(JSON.stringify(filtered, null, 2));
    return 0;
  }
  renderTable(filtered, statusFilterRaw);
  return 0;
}

function renderTable(entries: GovernQueueEntry[], statusFilter: string): void {
  if (entries.length === 0) {
    console.log(`(no ${statusFilter} govern entries)`);
    return;
  }
  const rows = entries.map((e) => ({
    id: e.id,
    status: e.status,
    tag: e.tag,
    origin: e.origin,
    target: e.target,
    submitted_at: e.submitted_at,
    verdict: e.verdict?.verdict ?? "",
  }));
  const cols: Array<keyof (typeof rows)[0]> = [
    "id",
    "status",
    "tag",
    "origin",
    "target",
    "submitted_at",
    "verdict",
  ];
  const widths: Record<string, number> = {};
  for (const c of cols) {
    widths[c] = Math.max(
      c.length,
      ...rows.map((r) => String(r[c] ?? "").length),
    );
  }
  const header = cols.map((c) => c.padEnd(widths[c]!)).join("  ");
  console.log(header);
  console.log(cols.map((c) => "-".repeat(widths[c]!)).join("  "));
  for (const r of rows) {
    console.log(
      cols.map((c) => String(r[c] ?? "").padEnd(widths[c]!)).join("  "),
    );
  }
}

// ─── promote-principle (W-C-03) ───

function handlePromotePrinciple(argv: string[]): number {
  const jsonRaw = readOption(argv, "json");
  if (!jsonRaw) {
    console.error("[onto] govern promote-principle: --json proposal is required.");
    console.error("Example JSON shape: {\"learning_ref\":{\"agent_id\":\"logic\",\"entry_marker\":\"...\"},\"target\":{\"category\":\"principle\",\"file_path\":\".onto/principles/X.md\",\"section\":\"NEW\"},\"rationale\":\"...\",\"conflict_check\":{\"reviewed_by_agent\":true,\"existing_principle_refs\":[],\"conflict_summary\":\"no conflict\"},\"workload_evidence\":{\"state_transitions\":10,\"evidence_summary\":\"...\",\"event_refs\":[]},\"source_impact\":\"high\"}");
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonRaw);
  } catch (e) {
    console.error(`[onto] govern promote-principle: --json parse error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error("[onto] govern promote-principle: --json must be a JSON object.");
    return 1;
  }

  const projectRoot = resolveProjectRoot(argv);
  const result = executePromotePrinciple(parsed as PromotePrincipleProposal, projectRoot);

  if (!result.success) {
    console.error(`[onto] govern promote-principle: ${result.reason}`);
    return 1;
  }

  console.log(JSON.stringify({
    status: "queued",
    id: result.id,
    gate_passed: result.gate_passed,
    similar_to: result.similar_to,
    next_action: "govern MCP design pending; inspect the queue artifact before deciding",
  }, null, 2));
  return 0;
}

// ─── route (W-C-02 drift engine) ───

function handleRoute(argv: string[]): number {
  const jsonRaw = readOption(argv, "json");
  if (!jsonRaw) {
    console.error("[onto] govern route: --json proposal is required.");
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonRaw);
  } catch (e) {
    console.error(
      `[onto] govern route: --json parse error: ${e instanceof Error ? e.message : String(e)}`,
    );
    return 1;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error("[onto] govern route: --json must be a JSON object.");
    return 1;
  }
  const obj = parsed as Record<string, unknown>;

  const summary = obj.summary;
  const targetFiles = obj.target_files;
  const changeKind = obj.change_kind;
  const rationale = obj.rationale;

  if (typeof summary !== "string" || summary.trim().length === 0) {
    console.error("[onto] govern route: proposal.summary (string) is required.");
    return 1;
  }
  if (
    !Array.isArray(targetFiles) ||
    targetFiles.length === 0 ||
    !targetFiles.every((f) => typeof f === "string" && f.length > 0)
  ) {
    console.error(
      "[onto] govern route: proposal.target_files must be a non-empty string array.",
    );
    return 1;
  }
  const validKinds: ChangeKind[] = ["docs_only", "code", "config", "mixed"];
  if (
    typeof changeKind !== "string" ||
    !validKinds.includes(changeKind as ChangeKind)
  ) {
    console.error(
      `[onto] govern route: proposal.change_kind must be one of ${validKinds.join(", ")}.`,
    );
    return 1;
  }

  const proposal: ChangeProposal = {
    summary,
    target_files: targetFiles as string[],
    change_kind: changeKind as ChangeKind,
  };
  if (typeof rationale === "string") proposal.rationale = rationale;

  const projectRoot = resolveProjectRoot(argv);
  const outcome = routeProposal(proposal, projectRoot);

  console.log(
    JSON.stringify(
      {
        status: "routed",
        route: outcome.decision.route,
        matched_rule: outcome.decision.matched_rule,
        reason: outcome.decision.reason,
        ...(outcome.queue_event_id
          ? { queue_event_id: outcome.queue_event_id }
          : {}),
      },
      null,
      2,
    ),
  );
  return 0;
}

// ─── decide ───

function handleDecide(argv: string[]): number {
  const id = argv.find((a) => !a.startsWith("--"));
  if (!id) {
    console.error("[onto] govern decide: <id> positional argument is required.");
    return 1;
  }
  const verdictRaw = readOption(argv, "verdict");
  const reason = readOption(argv, "reason");
  const decidedByOverride = readOption(argv, "decided-by");

  if (!verdictRaw || (verdictRaw !== "approve" && verdictRaw !== "reject")) {
    console.error(
      "[onto] govern decide: --verdict must be 'approve' or 'reject'.",
    );
    return 1;
  }
  if (!reason || reason.trim().length === 0) {
    console.error("[onto] govern decide: --reason is required.");
    return 1;
  }

  const projectRoot = resolveProjectRoot(argv);
  const queuePath = resolveQueuePath(projectRoot);
  const events = readQueueEvents(queuePath);
  const entries = projectQueue(events);
  const existing = entries.find((e) => e.id === id);
  if (!existing) {
    console.error(`[onto] govern decide: id '${id}' not found in queue.`);
    return 1;
  }
  if (existing.status === "decided") {
    console.error(
      `[onto] govern decide: id '${id}' already decided (verdict=${existing.verdict?.verdict}). v0 는 재판정 지원하지 않음.`,
    );
    return 1;
  }

  const verdict = verdictRaw as GovernVerdict;
  const event: GovernDecideEvent = {
    type: "decide",
    id,
    verdict,
    reason,
    decided_at: new Date().toISOString(),
    decided_by: decidedByOverride ?? "principal",
  };
  appendQueueEvent(queuePath, event);

  const applyNote =
    verdict === "approve"
      ? `(v0 는 기록만) 승인됨. ${existing.target} 파일의 실제 수정은 주체자 수동 편집 또는 W-C-02 drift-engine 책임.`
      : `(v0 는 기록만) 거부됨. 제안 내용은 폐기. ${existing.target} 파일은 변경 없음.`;

  console.log(
    JSON.stringify(
      {
        status: "decided",
        id,
        verdict,
        target: existing.target,
        tag: existing.tag,
        note: applyNote,
      },
      null,
      2,
    ),
  );
  return 0;
}
