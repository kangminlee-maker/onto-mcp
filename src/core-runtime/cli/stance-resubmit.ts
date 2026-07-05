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
  /** Index into stances[] when the submit-time validator reported it;
   * null for the on-disk validator, which reports issue+lens only. */
  stanceIndex: number | null;
  issueId: string;
  evidenceRef: string;
}

/** Submit-time validator throw site
 * (structured-output-tools `normalizeIssueStanceResponseSubmitArgs`). */
const SUBMIT_UNSUPPORTED_REF_PATTERN =
  /submit_issue_stance_response\.stances\[(\d+)\]\.evidence_refs contains unsupported ref for (\S+): (.*)$/m;
/** On-disk per-lens validator throw site
 * (issue-artifact-runtime `validateIssueStanceResponseObject`). */
const ON_DISK_UNSUPPORTED_REF_PATTERN =
  /issue-stance response for issue (\S+) and lens \S+ references unsupported evidence: (.*)$/m;

/**
 * Classify a unit failure message as an issue-stance unsupported-evidence-ref
 * validation rejection. Anchors on BOTH runtime-owned throw sites: the
 * submit-time whitelist (per-issue union set) and the stricter on-disk
 * per-lens re-validation — either rejection is the same failure class for
 * promotion purposes. Message text is not guaranteed to survive the worker
 * adapters' stderr (see readFrozenUnsupportedRefViolation for the structural
 * freeze-file source); this classifier is the in-process/message half.
 * Returns null for every other failure class so infra failures (timeout,
 * transport, empty output) keep their current semantics.
 */
export function classifyUnsupportedEvidenceRefFailure(
  message: string,
): UnsupportedEvidenceRefViolation | null {
  const submitMatch = SUBMIT_UNSUPPORTED_REF_PATTERN.exec(message);
  if (submitMatch) {
    const stanceIndex = Number.parseInt(submitMatch[1]!, 10);
    const issueId = submitMatch[2]!;
    const evidenceRef = submitMatch[3]!.trim();
    if (!Number.isFinite(stanceIndex) || issueId.length === 0) return null;
    return { stanceIndex, issueId, evidenceRef };
  }
  const onDiskMatch = ON_DISK_UNSUPPORTED_REF_PATTERN.exec(message);
  if (onDiskMatch) {
    const issueId = onDiskMatch[1]!;
    const evidenceRef = onDiskMatch[2]!.trim();
    if (issueId.length === 0) return null;
    return { stanceIndex: null, issueId, evidenceRef };
  }
  return null;
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
  const rejectedStanceLabel =
    violation.stanceIndex !== null
      ? `stances[${violation.stanceIndex}] (issue_id: ${violation.issueId})`
      : `stance for issue_id: ${violation.issueId}`;
  return [
    RESUBMIT_ERROR_SPEC_BEGIN,
    "",
    `## Resubmit required: evidence_refs validation rejected (attempt ${args.resubmitAttempt})`,
    "",
    "Your previous submit_issue_stance_response call was rejected by",
    "deterministic validation. Do not apologize or explain; call the submit",
    "tool again with a complete corrected payload.",
    "",
    `- rejected stance: ${rejectedStanceLabel}`,
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

function stripResubmitErrorSpec(packetText: string): string {
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
