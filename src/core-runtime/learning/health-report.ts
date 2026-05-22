/**
 * Learning pool health dashboard — pure aggregator and renderer.
 *
 * Design authority: .onto/processes/learn/health.md (rule owner)
 *
 * Responsibility:
 *   - Aggregate axis/purpose/type distribution, file size indicators,
 *     marker counts, and referenced domain list from ParsedLearningItem[]
 *   - Render a deterministic markdown dashboard
 *
 * Scope: pure. No I/O. No mutation.
 *
 * Consumers:
 *   - future learn/govern surfaces
 */

import type {
  LearningPurposeRole,
  LearningType,
  ParsedLearningItem,
} from "./promote/types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HealthTarget = "global" | "project";

export interface FileIndicator {
  agent: string;
  lines: number;
  source_path: string;
}

export interface HealthReport {
  target: HealthTarget;
  total_entries: number;
  file_count: number;
  largest_file: FileIndicator | null;
  axis_distribution: {
    methodology_only: number;
    domain_only: number;
    dual: number;
  };
  purpose_distribution: Record<
    Exclude<LearningPurposeRole, null> | "unassigned",
    number
  >;
  type_distribution: Record<LearningType, number>;
  event_markers: number;
  tag_incomplete: number;
  consolidated: number;
  retention_confirmed: number;
  domains: Array<{ domain: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export function buildHealthReport(
  items: ParsedLearningItem[],
  target: HealthTarget,
): HealthReport {
  const axis = { methodology_only: 0, domain_only: 0, dual: 0 };
  const purpose: HealthReport["purpose_distribution"] = {
    guardrail: 0,
    foundation: 0,
    convention: 0,
    insight: 0,
    unassigned: 0,
  };
  const type: Record<LearningType, number> = { fact: 0, judgment: 0 };
  const lineMax = new Map<string, number>();
  const domainCounts = new Map<string, number>();

  let event_markers = 0;
  let tag_incomplete = 0;
  let consolidated = 0;
  let retention_confirmed = 0;

  for (const item of items) {
    const hasMethodology = item.applicability_tags.includes("methodology");
    const hasDomain = item.applicability_tags.some((t) =>
      t.startsWith("domain/"),
    );
    if (hasMethodology && hasDomain) axis.dual += 1;
    else if (hasMethodology) axis.methodology_only += 1;
    else if (hasDomain) axis.domain_only += 1;

    if (item.role === null) purpose.unassigned += 1;
    else purpose[item.role] += 1;

    type[item.type] += 1;

    event_markers += item.event_markers.length;

    if (item.retention_confirmed_at !== null) retention_confirmed += 1;

    if (item.raw_line.includes("tag-incomplete")) tag_incomplete += 1;
    if (item.raw_line.includes("consolidated into")) consolidated += 1;

    const prior = lineMax.get(item.source_path) ?? 0;
    if (item.line_number > prior) lineMax.set(item.source_path, item.line_number);

    for (const tag of item.applicability_tags) {
      if (tag.startsWith("domain/")) {
        const d = tag.slice("domain/".length);
        domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
      }
    }
  }

  const file_count = lineMax.size;
  let largest_file: FileIndicator | null = null;
  for (const [source_path, lines] of lineMax) {
    if (largest_file === null || lines > largest_file.lines) {
      largest_file = { agent: extractAgentFromPath(source_path), lines, source_path };
    }
  }

  const domains = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.domain.localeCompare(b.domain),
    );

  return {
    target,
    total_entries: items.length,
    file_count,
    largest_file,
    axis_distribution: axis,
    purpose_distribution: purpose,
    type_distribution: type,
    event_markers,
    tag_incomplete,
    consolidated,
    retention_confirmed,
    domains,
  };
}

function extractAgentFromPath(sourcePath: string): string {
  const match = sourcePath.match(/learnings\/([^/]+)\.md$/);
  return match && match[1] ? match[1] : sourcePath;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function pct(part: number, total: number): string {
  if (total === 0) return "0";
  return String(Math.round((part / total) * 100));
}

export function renderHealthReport(report: HealthReport): string {
  const lines: string[] = [];
  const label = report.target === "global" ? "Global" : "Project";
  const total = report.total_entries;

  lines.push(`## Learning Health Dashboard`);
  lines.push("");
  lines.push(`### ${label} Learnings`);
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total entries | ${total} |`);
  lines.push(`| Files | ${report.file_count} |`);
  if (report.largest_file) {
    lines.push(
      `| Largest file | ${report.largest_file.agent} (${report.largest_file.lines} lines) |`,
    );
  } else {
    lines.push(`| Largest file | — |`);
  }
  lines.push("");
  lines.push("### Axis Distribution");
  lines.push("| Tag | Count | % |");
  lines.push("|-----|-------|---|");
  lines.push(
    `| methodology-only | ${report.axis_distribution.methodology_only} | ${pct(report.axis_distribution.methodology_only, total)}% |`,
  );
  lines.push(
    `| domain-only | ${report.axis_distribution.domain_only} | ${pct(report.axis_distribution.domain_only, total)}% |`,
  );
  lines.push(
    `| dual-tag | ${report.axis_distribution.dual} | ${pct(report.axis_distribution.dual, total)}% |`,
  );
  lines.push("");
  lines.push("### Purpose Distribution");
  lines.push("| Tag | Count |");
  lines.push("|-----|-------|");
  lines.push(`| guardrail | ${report.purpose_distribution.guardrail} |`);
  lines.push(`| foundation | ${report.purpose_distribution.foundation} |`);
  lines.push(`| convention | ${report.purpose_distribution.convention} |`);
  lines.push(`| insight | ${report.purpose_distribution.insight} |`);
  if (report.purpose_distribution.unassigned > 0) {
    lines.push(`| unassigned | ${report.purpose_distribution.unassigned} |`);
  }
  lines.push("");
  lines.push("### Type Distribution");
  lines.push("| Tag | Count | % |");
  lines.push("|-----|-------|---|");
  lines.push(
    `| fact | ${report.type_distribution.fact} | ${pct(report.type_distribution.fact, total)}% |`,
  );
  lines.push(
    `| judgment | ${report.type_distribution.judgment} | ${pct(report.type_distribution.judgment, total)}% |`,
  );
  lines.push("");
  lines.push("### Health Indicators");
  lines.push("| Indicator | Value | Note |");
  lines.push("|-----------|-------|------|");
  const largestLines = report.largest_file?.lines ?? 0;
  const sizeStatus = largestLines >= 200 ? "WARNING" : largestLines >= 100 ? "NOTICE" : "OK";
  lines.push(
    `| File size | ${sizeStatus} | 최대 ${largestLines}행 (100 NOTICE, 200 WARNING). 대응: learn promotion design에서 consolidation 검토 |`,
  );
  lines.push(
    `| Event markers | ${report.event_markers} | applied-then-found-invalid 누적. learn promotion design에서 후보로 표면화 |`,
  );
  lines.push(
    `| Tag-incomplete | ${report.tag_incomplete} | Creation gate 실패 수. 해당 학습 항목의 태그 수동 보완 필요 |`,
  );
  lines.push(
    `| Consolidated | ${report.consolidated} | Cross-agent dedup 수행 수. 조치 불필요 (정보만) |`,
  );
  lines.push(
    `| Retention-confirmed | ${report.retention_confirmed} | 명시적 유지 판정 수 |`,
  );
  lines.push("");
  lines.push("### Domains Referenced");
  if (report.domains.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(report.domains.map((d) => `${d.domain} (${d.count})`).join(", "));
  }

  return lines.join("\n");
}
