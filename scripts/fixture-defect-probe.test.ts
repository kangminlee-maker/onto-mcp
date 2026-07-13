import { describe, expect, it } from "vitest";
import { benchmarkFixture } from "./review-pipeline-benchmark.js";
import { transpileEvalModule } from "./fixture-defect-probe.js";

// V1 layer of the fixture-validity regime (review-cert/v3 design §D5): the
// seeded defect must actually EXECUTE as claimed, or the fixture proves nothing.
// Applied here to the two existing code fixtures (blobs already on disk); the
// new v3 fixtures (shared-root, clean-target) get their V1 proofs when authored
// (A-3). Each defect assertion is paired with a control that exercises the same
// export on a healthy input, so a broken probe (empty/miscompiled module, or a
// renamed export) fails loud instead of passing vacuously.
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
});
