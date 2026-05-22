import type { ScopeState, VerdictLogEntry } from "../../scope-runtime/types.js";
import { isPolicyChangeRequired } from "../../scope-runtime/types.js";
import { MAX_COMPILE_RETRIES } from "../../scope-runtime/constants.js";

/**
 * Render scope.md — the current status view of a scope.
 *
 * Pure function: (state) → string.
 * No side effects, no external I/O.
 */
export function renderScopeMd(state: ScopeState): string {
  const lines: string[] = [];

  // ── Header ──
  lines.push(`# Scope: ${state.title}`);
  lines.push("");

  // ── Current stage ──
  lines.push("## 현황");
  lines.push("");
  lines.push(`- **상태**: ${formatState(state.current_state)}`);
  if (state.direction) {
    lines.push(`- **방향**: ${state.direction}`);
  }
  lines.push(`- **마지막 업데이트**: revision ${state.latest_revision}`);
  lines.push("");

  // ── Blockers (only when present) ──
  const blockers = collectBlockers(state);
  if (blockers.length > 0) {
    lines.push("## 차단 상태");
    lines.push("");
    for (const b of blockers) {
      lines.push(`- ${b}`);
    }
    lines.push("");
  }

  // ── Next action ──
  lines.push("## 다음 행동");
  lines.push("");
  lines.push(`- ${formatNextAction(state)}`);
  lines.push("");

  // ── Scope boundaries (if locked) ──
  if (state.scope_boundaries) {
    lines.push("## 범위");
    lines.push("");
    if (state.scope_boundaries.in.length > 0) {
      lines.push("**포함:**");
      for (const item of state.scope_boundaries.in) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
    if (state.scope_boundaries.out.length > 0) {
      lines.push("**제외:**");
      for (const item of state.scope_boundaries.out) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  // ── Scanned sources ──
  if (state.grounding_sources && state.grounding_sources.length > 0) {
    lines.push("## 스캔 소스");
    lines.push("");
    for (const src of state.grounding_sources) {
      lines.push(`- \`${src.type}\`: ${src.path_or_url}`);
    }
    lines.push("");
  }

  // ── Constraint summary ──
  const { summary } = state.constraint_pool;
  if (summary.total > 0) {
    lines.push("## Constraint 현황");
    lines.push("");
    lines.push(`- 전체: ${summary.total}건 (필수 ${summary.required}, 권장 ${summary.recommended})`);
    lines.push(`- 결정 완료: ${summary.decided}건`);
    if (summary.undecided > 0) {
      lines.push(`- 미결정: ${summary.undecided}건`);
    }
    if (summary.clarify_pending > 0) {
      lines.push(`- clarify 대기: ${summary.clarify_pending}건`);
    }
    if (summary.invalidated > 0) {
      lines.push(`- 제외됨: ${summary.invalidated}건`);
    }
    const policyChangeCount = state.constraint_pool.constraints.filter(isPolicyChangeRequired).length;
    if (policyChangeCount > 0) {
      lines.push(`- 정책 변경 검토 필요: ${policyChangeCount}건`);
    }
    lines.push("");
  }

  // ── Validation results ──
  if (state.validation_result) {
    const vr = state.validation_result;
    lines.push("## 검증 결과");
    lines.push("");
    lines.push(`- **결과**: ${vr.result === "pass" ? "통과" : "실패"}`);
    lines.push(`- **통과**: ${vr.pass_count}건, **실패**: ${vr.fail_count}건`);
    if (vr.fail_count > 0 && vr.items.length > 0) {
      const failItems = vr.items.filter(i => i.result === "fail");
      for (const item of failItems) {
        lines.push(`- ${item.val_id} (${item.related_cst}): ${item.detail}`);
      }
    }
    lines.push("");
  }

  // ── Constraint decision details (#8) ──
  const decidedConstraints = state.constraint_pool.constraints.filter(c => c.status === "decided");
  if (decidedConstraints.length > 0) {
    lines.push("<details>");
    lines.push(`<summary>Constraint 결정 상세 (${decidedConstraints.length}건)</summary>`);
    lines.push("");
    lines.push("| CST-ID | 결정 | 선택 |");
    lines.push("|--------|------|------|");
    for (const c of decidedConstraints) {
      lines.push(`| ${c.constraint_id} | ${c.decision ?? "-"} | ${c.selected_option ?? "-"} |`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  // ── Recent decisions ──
  if (state.verdict_log.length > 0) {
    lines.push("## 최근 결정");
    lines.push("");
    const recent = state.verdict_log.slice(-5);
    for (const entry of recent) {
      lines.push(`- ${formatVerdictEntry(entry)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Helpers ───

const STATE_LABELS: Record<string, string> = {
  draft: "초안 (소스 스캔 전)",
  grounded: "소스 스캔 완료",
  exploring: "요구사항 탐색 중",
  align_proposed: "Align Packet 검토 중",
  align_locked: "방향·범위 확정됨",
  surface_iterating: "Surface 반복 수정 중",
  surface_confirmed: "Surface 확정됨 — constraint 결정 필요",
  constraints_resolved: "모든 constraint 결정 완료",
  target_locked: "Target 잠김 — compile 진행 중",
  compiled: "Build Spec 생성 완료",
  applied: "구현 적용 완료 — 검증 대기",
  validated: "검증 통과 — 종료 가능",
  closed: "종료됨",
  deferred: "보류됨",
  rejected: "거절됨",
};

function formatState(state: string): string {
  return STATE_LABELS[state] ?? state;
}

function formatNextAction(state: ScopeState): string {
  if (state.stale) {
    return "소스가 변경되었습니다. 재스캔이 필요합니다 (`/start`를 다시 실행하세요)";
  }

  if (state.convergence_blocked) {
    return "수렴 차단 상태입니다. 다음 중 하나를 선택하세요: (1) 방향 변경 (`/align redirect`) (2) scope 축소 (`/align revise`) (3) scope 보류 (`scope.deferred`)";
  }

  switch (state.current_state) {
    case "draft":
      return "소스를 스캔하세요 (`/start`를 실행하세요)";
    case "grounded":
      return "스캔이 끝났습니다. 대화 에이전트가 주체자에게 선택지 기반 질문으로 방향·범위·제약을 확인한 뒤, 수렴된 답을 bounded evolve runtime input으로 제출하세요. Runtime이 constraint.discovered 이벤트 + align-packet.md + align.proposed 이벤트를 기록합니다.";
    case "exploring": {
      const ep = state.exploration_progress;
      const phaseInfo = ep ? ` (Phase ${ep.current_phase}/6: ${ep.current_phase_name})` : "";
      return `요구사항을 탐색하고 있습니다${phaseInfo}. 질문에 답하여 scope를 구체화하세요`;
    }
    case "align_proposed":
      return "Align Packet을 읽고 방향과 범위를 확정하세요 (승인/수정/거절/재스캔 중 선택)";
    case "align_locked":
      return "방향이 확정되었습니다. 화면 설계를 시작하세요 (`/draft`를 실행하세요)";
    case "surface_iterating":
      return state.entry_mode === "experience"
        ? "mockup을 확인하세요 (`cd surface/preview && npm run dev`). 수정이 필요하면 피드백을, 맞으면 '확정합니다'라고 말씀하세요"
        : "API 명세를 확인하세요 (`surface/contract-diff/`). 수정이 필요하면 피드백을, 맞으면 '확정합니다'라고 말씀하세요";
    case "surface_confirmed":
      return state.constraint_pool.summary.undecided > 0
        ? `${state.constraint_pool.summary.undecided}건의 제약 사항에 대해 결정이 필요합니다. 각 항목의 선택지를 검토하고 결정하세요`
        : state.constraint_pool.summary.clarify_pending > 0
          ? `${state.constraint_pool.summary.clarify_pending}건의 확인이 필요합니다. 외부에서 정보를 확보한 뒤 \`/draft\`를 실행하여 결정을 제출하세요`
          : "모든 결정이 완료되었습니다. 확정을 진행합니다 (`/draft`를 실행하세요)";
    case "constraints_resolved":
      if (state.validation_result?.result === "fail") {
        return "검증에서 실패한 항목이 있습니다. 해당 제약 사항을 재검토한 뒤 다시 구현 명세를 생성하세요 (`/draft`를 실행하세요)";
      }
      if (state.retry_count_compile > 0) {
        return `compile 중 새 제약이 발견되었습니다 (재시도 ${state.retry_count_compile}회). 새 제약에 대해 결정한 뒤 진행하세요 (\`/draft\`를 실행하세요)`;
      }
      return "모든 제약 사항이 해결되었습니다. 구현 명세를 생성합니다 (`/draft`를 실행하세요)";
    case "target_locked":
      return "구현 명세(Build Spec)를 생성하고 있습니다";
    case "compiled":
      return "구현 명세가 완성되었습니다. Builder가 코드를 작성합니다";
    case "applied":
      return "코드 작성이 완료되었습니다. 검증을 진행합니다";
    case "validated":
      return "모든 검증을 통과했습니다. 결과를 확인하시고, 완료하려면 '완료'라고 말씀하세요";
    case "closed":
      return "이 scope는 완료되었습니다";
    case "deferred":
      return "이 scope는 보류 중입니다";
    case "rejected":
      return "이 scope는 거절되었습니다";
    default:
      return `현재 상태: ${state.current_state}`;
  }
}

function collectBlockers(state: ScopeState): string[] {
  const blockers: string[] = [];
  if (state.stale) {
    const sources = state.stale_sources?.map((s) => s.path).join(", ") ?? "알 수 없음";
    blockers.push(`소스가 변경되었습니다: ${sources} (revision ${state.stale_since ?? "?"}부터)`);
  }
  if (state.convergence_blocked) {
    blockers.push("수렴 차단: revise가 차단되었습니다. 행동을 선택해야 합니다");
  }
  if (state.constraint_pool.summary.clarify_pending > 0) {
    blockers.push(`clarify 미해소: ${state.constraint_pool.summary.clarify_pending}건. 해소 전까지 target 잠금 불가`);
  }
  if (state.current_state === "constraints_resolved" && state.retry_count_compile > 0) {
    blockers.push(`compile 중 새 제약이 발견되어 결정이 필요합니다 (재시도 ${state.retry_count_compile}/${MAX_COMPILE_RETRIES}회)`);
  }
  if (state.last_backward_reason) {
    blockers.push(`이전 단계 복귀 사유: ${state.last_backward_reason}`);
  }
  return blockers;
}

function formatVerdictEntry(entry: VerdictLogEntry): string {
  switch (entry.type) {
    case "align.locked":
      return `rev ${entry.revision}: 방향 확정 — "${entry.locked_direction}"`;
    case "constraint.decision_recorded":
      return `rev ${entry.revision}: ${entry.constraint_id} → ${entry.decision} (${entry.decision_owner})`;
    case "constraint.clarify_resolved":
      return `rev ${entry.revision}: ${entry.constraint_id} clarify 해소 → ${entry.decision} (${entry.decision_owner})`;
  }
}
