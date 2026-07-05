/**
 * Bounded unit resubmit — pure decision/projection logic (no I/O, no LLM
 * calls).
 *
 * When `review.execution.retry.resubmit.enabled` is on, an issue-stance unit
 * whose structured submit was rejected by the deterministic
 * `issue_evidence_refs` whitelist is re-requested through the unit's existing
 * retry budget with an error spec injected into its prompt packet, instead of
 * retrying blind. Exhaustion demotes the unit to complete-with-failure
 * (recorded in degradation-summary, disclosed non-blockingly downstream)
 * rather than halting the run — unless the same validation class fails a
 * strict majority of stance units, which is treated as a structural defect
 * and escalates to the existing whole-run halt with
 * `halt_reason = correlated_validation: …`.
 *
 * This module owns the deterministic parts: failure classification, error
 * spec construction, idempotent packet projection, and the correlated
 * escalation decision. File I/O and dispatch stay in
 * run-review-prompt-execution.
 *
 * Design: development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md (설계 A).
 */

/** Marker delimiting the runtime-owned error spec section inside a packet.
 * Replacement is idempotent: a later resubmit replaces the section instead of
 * stacking a second copy. */
export const RESUBMIT_ERROR_SPEC_BEGIN =
  "<!-- onto:resubmit-error-spec:begin -->";
export const RESUBMIT_ERROR_SPEC_END = "<!-- onto:resubmit-error-spec:end -->";

/** halt_reason prefix for the correlated-failure whole-run halt (F-A2). */
export const CORRELATED_VALIDATION_HALT_REASON = "correlated_validation";

export interface UnsupportedEvidenceRefViolation {
  stanceIndex: number;
  issueId: string;
  evidenceRef: string;
}

const UNSUPPORTED_REF_PATTERN =
  /submit_issue_stance_response\.stances\[(\d+)\]\.evidence_refs contains unsupported ref for (\S+): (.*)$/m;

/**
 * Classify a unit failure message as an issue-stance unsupported-evidence-ref
 * validation rejection. The pattern anchors on the single throw site in
 * structured-output-tools (`normalizeIssueStanceResponseSubmitArgs`), which
 * survives executor stderr wrapping on the worker path and direct Error
 * propagation on in-process paths. Returns null for every other failure class
 * so infra failures (timeout, transport, empty output) keep their current
 * semantics.
 */
export function classifyUnsupportedEvidenceRefFailure(
  message: string,
): UnsupportedEvidenceRefViolation | null {
  const match = UNSUPPORTED_REF_PATTERN.exec(message);
  if (!match) return null;
  const stanceIndex = Number.parseInt(match[1]!, 10);
  const issueId = match[2]!;
  const evidenceRef = match[3]!.trim();
  if (!Number.isFinite(stanceIndex) || issueId.length === 0) return null;
  return { stanceIndex, issueId, evidenceRef };
}

export function isUnsupportedEvidenceRefFailureMessage(
  message: string | null | undefined,
): boolean {
  return (
    typeof message === "string" &&
    classifyUnsupportedEvidenceRefFailure(message) !== null
  );
}

/**
 * Render the bounded error spec for a resubmit attempt. Contains only the
 * violation and the allowed set for the offending issue — never the failed
 * output itself (design: no full-output retransmission; the model rebuilds
 * the complete payload from the unchanged packet body).
 */
export function buildResubmitErrorSpec(args: {
  violation: UnsupportedEvidenceRefViolation;
  allowedEvidenceRefs: readonly string[];
  resubmitAttempt: number;
}): string {
  const { violation } = args;
  const allowedBlock =
    args.allowedEvidenceRefs.length > 0
      ? args.allowedEvidenceRefs.map((ref) => `- ${ref}`).join("\n")
      : "- (none — omit evidence_refs entries you cannot support)";
  return [
    RESUBMIT_ERROR_SPEC_BEGIN,
    "",
    `## Resubmit required: evidence_refs validation rejected (attempt ${args.resubmitAttempt})`,
    "",
    "Your previous submit_issue_stance_response call was rejected by",
    "deterministic validation. Do not apologize or explain; call the submit",
    "tool again with a complete corrected payload.",
    "",
    `- rejected stance: stances[${violation.stanceIndex}] (issue_id: ${violation.issueId})`,
    `- unsupported evidence_ref: ${violation.evidenceRef}`,
    `- allowed evidence_refs for ${violation.issueId}:`,
    allowedBlock,
    "",
    "Every stance's evidence_refs must come from that issue's allowed set in",
    "the schema context above. Resubmit the full stances array, not only the",
    "rejected entry.",
    "",
    RESUBMIT_ERROR_SPEC_END,
  ].join("\n");
}

/**
 * Project the error spec into a packet idempotently: strips a previous
 * runtime-owned spec section (if any) before appending the new one, so the
 * packet carries at most one spec regardless of how many resubmit rounds ran.
 */
export function applyResubmitErrorSpecToPacket(
  packetText: string,
  errorSpec: string,
): string {
  const stripped = stripResubmitErrorSpec(packetText);
  return `${stripped.trimEnd()}\n\n${errorSpec.trimEnd()}\n`;
}

export function stripResubmitErrorSpec(packetText: string): string {
  const begin = packetText.indexOf(RESUBMIT_ERROR_SPEC_BEGIN);
  if (begin === -1) return packetText;
  const end = packetText.indexOf(RESUBMIT_ERROR_SPEC_END, begin);
  if (end === -1) return packetText.slice(0, begin);
  return (
    packetText.slice(0, begin) +
    packetText.slice(end + RESUBMIT_ERROR_SPEC_END.length)
  );
}

export function packetHasResubmitErrorSpec(packetText: string): boolean {
  return packetText.includes(RESUBMIT_ERROR_SPEC_BEGIN);
}

/**
 * Correlated escalation decision: the same validation class failing a strict
 * majority (>50%) of stance units signals a structural defect (prompt,
 * schema, or context assembly), not per-unit output noise — whole-run halt
 * stays the correct promotion there.
 */
export function correlatedValidationExceeded(args: {
  validationFailedUnitCount: number;
  totalUnitCount: number;
}): boolean {
  if (args.totalUnitCount <= 0) return false;
  return args.validationFailedUnitCount * 2 > args.totalUnitCount;
}
