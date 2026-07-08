/**
 * Bounded unit resubmit — pure decision/projection logic (no I/O, no LLM
 * calls). Unit-agnostic: the error-spec construction and packet projection are
 * shared across review units; per-unit failure classifiers select which
 * validation rejections are correctable.
 *
 * When `review.execution.retry.resubmit.enabled` is on, a unit whose structured
 * submit was rejected by a deterministic evidence-ref whitelist is re-requested
 * through the unit's existing retry budget with an error spec injected into its
 * prompt packet, instead of retrying blind.
 *
 * Wired units (§4-6a, §4-2c/2-A):
 * - issue-stance: `issue_evidence_refs` whitelist. Exhaustion demotes the unit
 *   to complete-with-failure (degradation-summary, disclosed non-blockingly)
 *   rather than halting — unless the same validation class fails a strict
 *   majority of stance units (structural defect → whole-run halt with
 *   `halt_reason = correlated_validation: …`). The demotion/correlated
 *   machinery below is stance-only, which is why stance is EXCLUDED from the
 *   §4-2c structural retry gate (see RESUBMIT_UNIT_ROUTING.gateEligible).
 * - deliberation-response: `allowed_evidence_refs` whitelist. Exhaustion reuses
 *   deliberation's existing non-halting degrade (unavailable-completion), so it
 *   needs no demotion/correlated machinery. Only the submit-time rejection is
 *   correctable; on-disk rejections run post-pool and degrade.
 * - synthesis-response: `allowed_source_refs` whitelist (§4-2c/2-A). Its
 *   rejection message always carries `source_refs_used` → substring-classified
 *   output_contract, so its in-loop resubmit depends on the structural retry
 *   gate. Exhaustion reuses synthesis's existing non-halting degrade
 *   (completeUnavailableSynthesisResponseUnit); no demotion/correlated
 *   machinery.
 *
 * This module owns the deterministic parts: failure classification, error
 * spec construction, idempotent packet projection, and the correlated
 * escalation decision. File I/O and dispatch stay in
 * run-review-prompt-execution.
 *
 * Design: development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md (설계 A),
 *   development-records/design/20260707-s4-6a-deliberation-resubmit-design.md (§4-6a 확대).
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

/** Deliberation-response evidence_refs whitelist rejection (§4-6a). Unlike the
 * stance messages, the deliberation throw embeds only the offending ref (not
 * issue/lens), so this classifier captures the ref alone and the caller
 * recovers issue_id/lens_id from the dispatch unit_id
 * (`deliberation:<issueId>:<lensId>`). */
export interface DeliberationUnsupportedEvidenceRefViolation {
  evidenceRef: string;
}

/** Submit-time throw site (structured-output-tools `assertAllowedRefs` via
 * `normalizeIssueDeliberationResponseSubmitArgs`). This is the only deliberation
 * evidence_refs rejection reachable by resubmit: the executor throws it during
 * the dispatch (retryable) and freezes it as the salvage input. The on-disk
 * validator (`validateIssueDeliberationResponseObject`) runs post-pool and is
 * caught into a non-halting degrade — it never re-enters the retry loop — so it
 * is deliberately not anchored here. */
const SUBMIT_DELIBERATION_UNSUPPORTED_REF_PATTERN =
  /submit_issue_deliberation_response\.evidence_refs contains unsupported ref: (.*)$/m;

/**
 * Classify a unit failure message as a submit-time deliberation-response
 * unsupported-evidence-ref rejection. Returns null for every other class so
 * infra failures — and on-disk rejections, which degrade rather than resubmit —
 * keep their current semantics.
 */
export function classifyDeliberationUnsupportedEvidenceRefFailure(
  message: string,
): DeliberationUnsupportedEvidenceRefViolation | null {
  const submitMatch = SUBMIT_DELIBERATION_UNSUPPORTED_REF_PATTERN.exec(message);
  if (submitMatch) {
    const evidenceRef = submitMatch[1]!.trim();
    if (evidenceRef.length === 0) return null;
    return { evidenceRef };
  }
  return null;
}

/** Issue-synthesis-response `source_refs_used` whitelist rejection (§4-2c/2-A).
 * `sourceRef` is the offending ref for the unsupported-ref rejection, or null
 * when the submit cited no allowed source ref at all (the "must include at
 * least one" rejection) — both are resubmit-correctable by re-prompting with the
 * allowed set. The issue_id the message lacks is recovered by the caller from
 * the dispatch unit_id (`synthesis:<issueId>`). */
export interface SynthesisUnsupportedSourceRefViolation {
  sourceRef: string | null;
}

/** Submit-time throw sites in `normalizeIssueSynthesisResponseSubmitArgs`
 * (structured-output-tools): `assertAllowedRefs` for a bad ref, and the
 * "must include at least one" guard for an all-invalid set. The empty
 * allowed-set rejection ("cannot validate … because allowed_source_refs is
 * empty") is deliberately NOT matched — an empty allowed set is a runtime/context
 * condition a resubmit cannot correct, so it stays non-retryable. */
const SUBMIT_SYNTHESIS_UNSUPPORTED_REF_PATTERN =
  /submit_issue_synthesis_response\.source_refs_used contains unsupported ref: (.*)$/m;
const SUBMIT_SYNTHESIS_MISSING_ALLOWED_REF_PATTERN =
  /submit_issue_synthesis_response\.source_refs_used must include at least one allowed source ref\./;

/**
 * Classify a unit failure message as a submit-time synthesis-response
 * unsupported/missing source-ref rejection. Returns null for every other class
 * (including the non-correctable empty-allowed-set rejection) so infra failures
 * keep their current semantics.
 */
export function classifySynthesisUnsupportedSourceRefFailure(
  message: string,
): SynthesisUnsupportedSourceRefViolation | null {
  const unsupported = SUBMIT_SYNTHESIS_UNSUPPORTED_REF_PATTERN.exec(message);
  if (unsupported) {
    const sourceRef = unsupported[1]!.trim();
    if (sourceRef.length === 0) return null;
    return { sourceRef };
  }
  if (SUBMIT_SYNTHESIS_MISSING_ALLOWED_REF_PATTERN.test(message)) {
    return { sourceRef: null };
  }
  return null;
}

/** Which review unit a resubmit error spec targets. Absent → issue-stance
 * (the original cut; output stays byte-identical). `deliberation` carries the
 * lens_id the message text lacks; `synthesis` carries the issue_id the
 * `source_refs_used` rejection text lacks (recovered from the unit_id). */
export type ResubmitUnitDescriptor =
  | { kind: "stance" }
  | { kind: "deliberation"; lensId: string }
  | { kind: "synthesis"; issueId: string };

/**
 * Neutralize the runtime-owned section markers inside a value before it is
 * interpolated into the spec. The rejected `evidence_ref` is model-controlled;
 * a value literally containing an END (or BEGIN) marker would land as a
 * premature delimiter inside the spec and fool the idempotent strip
 * (`indexOf(END, begin)` matches the injected marker first), orphaning spec
 * fragments and breaking the at-most-one-spec invariant across resubmit rounds.
 * Marker-free values (every normal ref) are returned unchanged, so this is a
 * no-op for the common path. Applied to every dynamic interpolation for
 * defense-in-depth even though only the ref is model-controlled today.
 */
function neutralizeSpecMarkers(value: string): string {
  return value
    .split(RESUBMIT_ERROR_SPEC_BEGIN)
    .join("(spec marker removed)")
    .split(RESUBMIT_ERROR_SPEC_END)
    .join("(spec marker removed)");
}

/**
 * Render the bounded error spec for a resubmit attempt. Contains only the
 * violation and the allowed set for the offending unit — never the failed
 * output itself (design: no full-output retransmission; the model rebuilds
 * the complete payload from the unchanged packet body). Unit-agnostic: the
 * `unit` descriptor selects the submit tool, rejected-unit label, allowed-set
 * header, and closing instruction; stance is the default and unchanged.
 */
export function buildResubmitErrorSpec(args: {
  violation: UnsupportedEvidenceRefViolation;
  allowedEvidenceRefs: readonly string[];
  resubmitAttempt: number;
  unit?: ResubmitUnitDescriptor;
}): string {
  const { violation } = args;
  const evidenceRef = neutralizeSpecMarkers(violation.evidenceRef);
  const issueId = neutralizeSpecMarkers(violation.issueId);
  // Field-name vocabulary differs by unit: stance/deliberation reject
  // `evidence_refs`, synthesis rejects `source_refs_used`. Defaulting to the
  // evidence_refs vocabulary keeps stance/deliberation output byte-identical.
  const refFieldPlural =
    args.unit?.kind === "synthesis" ? "source_refs_used" : "evidence_refs";
  const refFieldSingular =
    args.unit?.kind === "synthesis" ? "source ref" : "evidence_ref";
  const allowedBlock =
    args.allowedEvidenceRefs.length > 0
      ? args.allowedEvidenceRefs
          .map((ref) => `- ${neutralizeSpecMarkers(ref)}`)
          .join("\n")
      : `- (none — omit ${refFieldPlural} entries you cannot support)`;
  const spec =
    args.unit?.kind === "deliberation"
      ? {
          submitTool: "submit_issue_deliberation_response",
          rejectedLine: `- rejected: deliberation for issue_id: ${issueId}, lens_id: ${neutralizeSpecMarkers(args.unit.lensId)}`,
          allowedHeader: "- allowed evidence_refs:",
          closing: [
            "Every evidence_ref must come from the allowed set in the schema",
            "context above. Resubmit the full deliberation response, not only the",
            "rejected entry.",
          ],
        }
      : args.unit?.kind === "synthesis"
      ? {
          submitTool: "submit_issue_synthesis_response",
          rejectedLine: `- rejected: synthesis response for issue_id: ${issueId}`,
          allowedHeader: "- allowed source_refs_used:",
          closing: [
            "Every source ref must come from the allowed set in the schema",
            "context above. Resubmit the full synthesis response, not only the",
            "rejected entry.",
          ],
        }
      : {
          submitTool: "submit_issue_stance_response",
          rejectedLine: `- rejected stance: ${
            violation.stanceIndex !== null
              ? `stances[${violation.stanceIndex}] (issue_id: ${issueId})`
              : `stance for issue_id: ${issueId}`
          }`,
          allowedHeader: `- allowed evidence_refs for ${issueId}:`,
          closing: [
            "Every stance's evidence_refs must come from that issue's allowed set in",
            "the schema context above. Resubmit the full stances array, not only the",
            "rejected entry.",
          ],
        };
  // A specific offending ref → name it; an empty ref (synthesis "must include at
  // least one" rejection) → instruct citing from the allowed set instead.
  const refLine =
    evidenceRef.length > 0
      ? `- unsupported ${refFieldSingular}: ${evidenceRef}`
      : `- you cited no allowed ${refFieldSingular}; include at least one from the allowed set below`;
  return [
    RESUBMIT_ERROR_SPEC_BEGIN,
    "",
    `## Resubmit required: ${refFieldPlural} validation rejected (attempt ${args.resubmitAttempt})`,
    "",
    `Your previous ${spec.submitTool} call was rejected by`,
    "deterministic validation. Do not apologize or explain; call the submit",
    "tool again with a complete corrected payload.",
    "",
    spec.rejectedLine,
    refLine,
    spec.allowedHeader,
    allowedBlock,
    "",
    ...spec.closing,
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
