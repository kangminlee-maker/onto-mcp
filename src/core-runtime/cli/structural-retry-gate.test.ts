import { describe, expect, it } from "vitest";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import {
  RESUBMIT_UNIT_ROUTING,
  shouldRetryUnitFailure,
  type ExecutionDispatchResult,
} from "./run-review-prompt-execution.js";

/**
 * §4-2c structural retry gate. Whitelist-ref rejections are raw Errors whose
 * message contains an envelope field-name substring that failureKindFromMessage
 * maps to `output_contract` (normally terminal). The gate routes such a failure
 * back to a corrective retry iff resubmit is enabled AND the unit is
 * gate-eligible AND the precise structural classifier matches. These messages
 * are the real submit-rejection strings; each is verified to be output_contract
 * (OFF→terminal) so the ON→retry assertions are discriminating, not vacuous.
 */

// synthesis: message ALWAYS carries `source_refs_used` → output_contract.
const SYNTHESIS_UNSUPPORTED_REF =
  "submit_issue_synthesis_response.source_refs_used contains unsupported ref: bad-ref";
const SYNTHESIS_MISSING_ALLOWED =
  "submit_issue_synthesis_response.source_refs_used must include at least one allowed source ref.";
// output_contract (has `source_refs_used`) but NOT resubmit-correctable: an
// empty allowed set is a runtime/context condition a resubmit cannot fix. Real
// throw site: structured-output-tools normalizeIssueSynthesisResponseSubmitArgs.
const SYNTHESIS_UNCORRECTABLE =
  "submit_issue_synthesis_response cannot validate source_refs_used because allowed_source_refs is empty.";
// deliberation: normal rejection is executor_exit; only a hallucinated ref that
// carries a poison substring (`schema_version`) is misclassified output_contract.
const DELIBERATION_POISON_UNSUPPORTED_REF =
  "submit_issue_deliberation_response.evidence_refs contains unsupported ref: hallucinated-schema_version-ref";
// stance: hallucinated ref carrying a poison substring (`issue_id`) →
// output_contract AND stance-classifier-matchable (the rare-poison-stance case).
const STANCE_POISON_UNSUPPORTED_REF =
  "submit_issue_stance_response.stances[0].evidence_refs contains unsupported ref for issue-001: hallucinated-issue_id-ref";

function dispatch(outputFormat: string): ExecutionDispatchResult {
  return {
    unit_id: `unit:${outputFormat}`,
    unit_kind: "synthesize",
    packet_path: "/nonexistent/packet.md",
    output_path: "/nonexistent/output.yaml",
    output_format: outputFormat as ExecutionDispatchResult["output_format"],
  };
}

function profile(enabled: boolean): ReviewExecutionProfile {
  return {
    retry: { resubmit: { enabled } },
  } as unknown as ReviewExecutionProfile;
}

function gate(
  outputFormat: string,
  message: string,
  enabled: boolean,
): boolean {
  return shouldRetryUnitFailure({
    error: new Error(message),
    attempt: 0,
    maxRetries: 2,
    dispatch: dispatch(outputFormat),
    reviewExecutionProfile: profile(enabled),
  });
}

describe("provider refusal classification — transient wins over echoed contract keywords", () => {
  // The wedge that produced the live mislabel (2026-07-18): a capacity/quota
  // refusal arrives with the worker's echoed packet text in the message, and
  // that echo contains contract keywords (schema_version, boundary_notes, …)
  // that failureKindFromMessage would classify output_contract (terminal).
  // The transient scan runs first, so the refusal must be retryable even with
  // resubmit OFF — and must not depend on gate eligibility.
  const CAPACITY_WITH_ECHOED_PACKET =
    "codex worker did not produce structured output json.\n" +
    "schema_version: onto-review/1\nboundary_notes: ...\n" +
    "ERROR: Selected model is at capacity. Please try a different model.";
  const USAGE_LIMIT_WITH_ECHOED_PACKET =
    "claude worker reported failure: You've hit your usage limit.\n" +
    "issue_id: issue-001\nschema_version: onto-review/1";

  it("capacity refusal is retryable (executor_exit), not terminal output_contract", () => {
    expect(gate("issue-synthesis-response", CAPACITY_WITH_ECHOED_PACKET, false)).toBe(true);
  });

  it("usage-limit refusal is retryable (executor_exit), not terminal output_contract", () => {
    expect(gate("issue-stance-response", USAGE_LIMIT_WITH_ECHOED_PACKET, false)).toBe(true);
  });

  it("the echoed-packet keywords alone (no refusal) stay terminal — the discriminating control", () => {
    const echoOnly =
      "codex worker did not produce structured output json.\nschema_version: onto-review/1";
    expect(gate("issue-synthesis-response", echoOnly, false)).toBe(false);
  });

  it("bare 'at capacity'/'usage limit' in item-local content do NOT reroute a contract failure", () => {
    // The signatures are anchored to the full provider phrases precisely so
    // that domain text or a hallucinated ref echoed by the validator cannot
    // turn a terminal contract failure into a retryable transient one.
    const hallucinatedRef =
      "submit_issue_synthesis_response.source_refs_used contains unsupported ref: warehouse at capacity";
    expect(gate("issue-synthesis-response", hallucinatedRef, false)).toBe(false);
    const domainEcho =
      "submit_issue_synthesis_response.source_refs_used contains unsupported ref: api usage limit note";
    expect(gate("issue-synthesis-response", domainEcho, false)).toBe(false);
  });
});

describe("structural retry gate — shouldRetryUnitFailure (§4-2c)", () => {
  it("OFF (resubmit disabled): output_contract stays terminal for every unit (byte-identical)", () => {
    // Confirms each message is output_contract to begin with: OFF must be
    // non-retryable across stance/deliberation/synthesis.
    expect(gate("issue-synthesis-response", SYNTHESIS_UNSUPPORTED_REF, false)).toBe(false);
    expect(gate("issue-synthesis-response", SYNTHESIS_MISSING_ALLOWED, false)).toBe(false);
    expect(gate("issue-deliberation-response", DELIBERATION_POISON_UNSUPPORTED_REF, false)).toBe(false);
    expect(gate("issue-stance-response", STANCE_POISON_UNSUPPORTED_REF, false)).toBe(false);
  });

  it("ON: gate-eligible correctable rejection becomes retryable (synthesis, both patterns)", () => {
    expect(gate("issue-synthesis-response", SYNTHESIS_UNSUPPORTED_REF, true)).toBe(true);
    expect(gate("issue-synthesis-response", SYNTHESIS_MISSING_ALLOWED, true)).toBe(true);
  });

  it("ON: gate-eligible correctable rejection becomes retryable (deliberation poison)", () => {
    expect(gate("issue-deliberation-response", DELIBERATION_POISON_UNSUPPORTED_REF, true)).toBe(true);
  });

  it("ON: rare-poison stance becomes retryable under the same structural classifier", () => {
    expect(gate("issue-stance-response", STANCE_POISON_UNSUPPORTED_REF, true)).toBe(true);
  });

  it("negative control: ON output_contract that is NOT a correctable ref rejection stays non-retryable", () => {
    expect(gate("issue-synthesis-response", SYNTHESIS_UNCORRECTABLE, true)).toBe(false);
  });

  it("non-output_contract failure classes are unchanged by the gate", () => {
    // executor_exit (generic worker failure) retries regardless of resubmit.
    expect(gate("issue-synthesis-response", "worker failed unexpectedly", false)).toBe(true);
    expect(gate("issue-synthesis-response", "worker failed unexpectedly", true)).toBe(true);
    // empty_output stays terminal regardless of resubmit.
    expect(gate("issue-synthesis-response", "unit produced empty output", false)).toBe(false);
    expect(gate("issue-synthesis-response", "unit produced empty output", true)).toBe(false);
  });

  it("attempt budget is respected before any override", () => {
    expect(
      shouldRetryUnitFailure({
        error: new Error(SYNTHESIS_UNSUPPORTED_REF),
        attempt: 2,
        maxRetries: 2,
        dispatch: dispatch("issue-synthesis-response"),
        reviewExecutionProfile: profile(true),
      }),
    ).toBe(false);
  });
});

describe("RESUBMIT_UNIT_ROUTING — single-source registry (§4-2c M-1/F-2)", () => {
  it("stance, deliberation, and synthesis are gate-eligible for correctable output_contract-poison failures", () => {
    expect(RESUBMIT_UNIT_ROUTING["issue-stance-response"]?.gateEligible).toBe(true);
    expect(RESUBMIT_UNIT_ROUTING["issue-deliberation-response"]?.gateEligible).toBe(true);
    expect(RESUBMIT_UNIT_ROUTING["issue-synthesis-response"]?.gateEligible).toBe(true);
  });

  it("lockstep (M-1): every gate-eligible unit has a wired strategy, and at least one exists", () => {
    const eligible = Object.values(RESUBMIT_UNIT_ROUTING).filter((r) => r.gateEligible);
    expect(eligible.length).toBeGreaterThan(0);
    for (const routing of eligible) {
      expect(typeof routing.apply).toBe("function");
    }
  });

  it("classifiers match the real submit-rejection messages (non-vacuous)", () => {
    expect(RESUBMIT_UNIT_ROUTING["issue-synthesis-response"]?.classify(SYNTHESIS_UNSUPPORTED_REF)).not.toBeNull();
    expect(RESUBMIT_UNIT_ROUTING["issue-synthesis-response"]?.classify(SYNTHESIS_MISSING_ALLOWED)).not.toBeNull();
    expect(RESUBMIT_UNIT_ROUTING["issue-synthesis-response"]?.classify(SYNTHESIS_UNCORRECTABLE)).toBeNull();
    expect(RESUBMIT_UNIT_ROUTING["issue-deliberation-response"]?.classify(DELIBERATION_POISON_UNSUPPORTED_REF)).not.toBeNull();
    expect(RESUBMIT_UNIT_ROUTING["issue-stance-response"]?.classify(STANCE_POISON_UNSUPPORTED_REF)).not.toBeNull();
  });
});
