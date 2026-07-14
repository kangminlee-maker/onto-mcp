import { describe, expect, it } from "vitest";
import { benchmarkFixture } from "./review-pipeline-benchmark.js";
import {
  fixtureBlobStructure,
  transpileEvalModule,
} from "./fixture-defect-probe.js";

// V1 layer of the fixture-validity regime (review-cert/v3 design §D5). V1 means
// something DIFFERENT per fixture character (MF-5):
//   - defective fixtures (review-pipeline, retry-policy, shared-root): the seeded
//     defect must actually EXECUTE as claimed, or the fixture proves nothing.
//   - shared-root additionally: two DISTINCT surface defects deriving from ONE
//     root is not a single assert — a STRUCTURAL proof (callee graph) shows both
//     surfaces share the same code path and the independent defect does not.
//   - clean-target: with zero material defects there is nothing to execute-prove,
//     so V1 is a STRUCTURAL check instead — no material obligation binds the
//     boundary decoy, and the decoy symbols exist.
// Each defect assertion is paired with a control that exercises the same export
// on a healthy input, so a broken probe (empty/miscompiled module, or a renamed
// export) fails loud instead of passing vacuously.
describe("review-cert fixture defect V1 proofs", () => {
  it("retry-policy-target-v1: retryBudget treats an explicit maxRetries 0 as absent", async () => {
    const spec = benchmarkFixture("retry-policy-target-v1");
    const source = spec.files[spec.target_path];
    expect(source).toBeDefined();
    const mod = await transpileEvalModule(source!);
    const retryBudget = mod.retryBudget as (r: { maxRetries?: number }) => number;
    // Defect: `request.maxRetries || 3` — falsy defaulting swallows the zero,
    // so an explicit "no retries" becomes the default 3.
    expect(retryBudget({ maxRetries: 0 })).toBe(3);
    // Control: a non-zero budget passes through unchanged (probe sees the real
    // function, not a constant).
    expect(retryBudget({ maxRetries: 5 })).toBe(5);
  });

  it("review-pipeline-target-v1: unstableFormat returns a non-string despite its string contract", async () => {
    const spec = benchmarkFixture("review-pipeline-target-v1");
    const source = spec.files[spec.target_path];
    expect(source).toBeDefined();
    const mod = await transpileEvalModule(source!);
    const unstableFormat = mod.unstableFormat as (v: unknown) => string;
    // Defect: JSON.stringify(undefined) is undefined, not the declared string.
    expect(unstableFormat(undefined)).toBeUndefined();
    expect(typeof unstableFormat(undefined)).not.toBe("string");
    // Control: a normal value still formats to a string.
    expect(typeof unstableFormat({ a: 1 })).toBe("string");
  });

  it("shared-root-target-v1: two surface defects fire AND structurally share the rawFormat root", async () => {
    const spec = benchmarkFixture("shared-root-target-v1");
    const source = spec.files[spec.target_path];
    expect(source).toBeDefined();

    // ── Execution proof: every seeded defect fires ──────────────────────────
    const mod = await transpileEvalModule(source!);
    const unstableFormat = mod.unstableFormat as (v: unknown) => string;
    const alternateFormat = mod.alternateFormat as (v: unknown) => string;
    const truncate = mod.truncate as (text: string, max: number) => string;
    // Surface defects 1 + 2: both return a non-string on top-level undefined.
    expect(unstableFormat(undefined)).toBeUndefined();
    expect(alternateFormat(undefined)).toBeUndefined();
    // Independent defect: off-by-one drops the last character (asked for 4, got 3).
    expect(truncate("abcd", 4)).toBe("abc");
    // Controls (probe sees the real functions, not constants):
    expect(typeof unstableFormat({ a: 1 })).toBe("string");
    expect(typeof alternateFormat({ a: 1 })).toBe("string");
    expect(truncate("ab", 5)).toBe("ab"); // max exceeds length → nothing dropped

    // ── Structural shared-root proof (NOT a single assert) ──────────────────
    // Both surface functions route through the SAME rawFormat root, that root is
    // single-sourced (the sole JSON.stringify carrier), and the independent
    // defect does not touch it. If alternateFormat had its own private
    // JSON.stringify instead of delegating to rawFormat, rootCarriers would list
    // two functions and this proof would fail — so it genuinely proves a shared
    // code path, not two coincidentally-identical defects.
    const { callees } = fixtureBlobStructure(source!);
    expect(callees.unstableFormat).toContain("rawFormat");
    expect(callees.alternateFormat).toContain("rawFormat");
    expect(callees.truncate ?? []).not.toContain("rawFormat");
    const rootCarriers = Object.entries(callees)
      .filter(([, called]) => called.includes("JSON.stringify"))
      .map(([fn]) => fn);
    expect(rootCarriers).toEqual(["rawFormat"]);
  });

  it("clean-target-v1: boundary decoy present + no material obligation binds it (structural, execution-exempt)", () => {
    // Zero material defects → nothing to execute-prove. V1 is structural: the
    // decoy symbols exist and the reviewed core is independent of them, so their
    // public-API status is a genuine boundary uncertainty, not a hidden defect.
    const spec = benchmarkFixture("clean-target-v1");
    const source = spec.files[spec.target_path];
    expect(source).toBeDefined();
    const { callees, exportedSymbols } = fixtureBlobStructure(source!);

    // decoy 용어 존재: the boundary decoy symbols are actually declared/exported.
    expect(exportedSymbols).toContain("telemetryLabel");
    expect(exportedSymbols).toContain("debugChannelState");

    // caller/API 의무 부재: the reviewed core (summarizeChannel) references
    // neither decoy symbol — nothing binds them into a material obligation.
    const coreCallees = callees.summarizeChannel ?? [];
    expect(coreCallees).not.toContain("telemetryLabel");
    expect(coreCallees).not.toContain("debugChannelState");
    // 물질 결함 부재 (structural signal): the core does not route through the
    // known unstable-format defect root either — its only callee is the safe
    // numeric reduction. (Not an exhaustive absence proof; the gate-level 3-way
    // discrimination in semantic-quality-gate.test.ts loads clean-target's
    // behavioral control.)
    expect(coreCallees).not.toContain("JSON.stringify");
    expect(coreCallees).toEqual(["inputs.reduce"]);
  });
});
