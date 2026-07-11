import { describe, expect, it } from "vitest";
import {
  findB4BenchCandidateHookBindingViolations,
  findBenchCandidateTokenPolicyViolations,
  isBenchCandidateTokenScannedPath,
} from "../../../scripts/check-supported-models-token-policy.js";

describe("benchCandidate token policy", () => {
  it("allows the token only in the runtime/test/harness allowlist", () => {
    expect(
      findBenchCandidateTokenPolicyViolations([
        {
          path: "src/core-runtime/discovery/supported-models.ts",
          text: "export interface BenchCandidateModelAllowance {}",
        },
      ]),
    ).toEqual([]);
    expect(
      findBenchCandidateTokenPolicyViolations([
        {
          path: "src/mcp/tool-schemas.ts",
          text: "benchCandidate: z.string().optional()",
        },
        {
          path: "src/core-runtime/discovery/settings-chain.ts",
          text: "benchCandidates: z.array(z.string()).optional()",
        },
      ]),
    ).toEqual([
      {
        path: "src/mcp/tool-schemas.ts",
        line: 1,
        column: 1,
        token: "benchCandidate",
      },
      {
        path: "src/core-runtime/discovery/settings-chain.ts",
        line: 1,
        column: 1,
        token: "benchCandidates",
      },
    ]);
  });

  it("does not scan historical design records or implementation-map projections", () => {
    expect(isBenchCandidateTokenScannedPath("development-records/design/x.md"))
      .toBe(false);
    expect(isBenchCandidateTokenScannedPath("docs/architecture/x.md")).toBe(false);
    expect(isBenchCandidateTokenScannedPath("IMPLEMENTATION_MAP.html")).toBe(false);
    expect(
      findBenchCandidateTokenPolicyViolations([
        {
          path: "development-records/design/x.md",
          text: "benchCandidate historical note",
        },
        {
          path: "IMPLEMENTATION_MAP.html",
          text: "benchCandidate backlog note",
        },
      ]),
    ).toEqual([]);
  });

  it("requires B4 to call the helper before candidate config construction", () => {
    const source = `
      import { assertB4BenchCandidateDispatchAllowed } from "../src/core-runtime/discovery/supported-models.ts";
      const baseline = resolveLlmProviderConfig({ config: { llm: authorLlm } });
      assertB4BenchCandidateDispatchAllowed({ provider: args.candidate.provider, model: args.candidate.model });
      const candidate = resolveLlmProviderConfig({
        config: { llm: { provider: args.candidate.provider, model: args.candidate.model } },
      });
    `;
    expect(findB4BenchCandidateHookBindingViolations(source)).toEqual([]);
  });

  it("does not accept a comment-only helper mention as B4 binding", () => {
    const source = `
      import { assertB4BenchCandidateDispatchAllowed } from "../src/core-runtime/discovery/supported-models.ts";
      // assertB4BenchCandidateDispatchAllowed({ provider: args.candidate.provider });
      const candidate = resolveLlmProviderConfig({
        config: { llm: { provider: args.candidate.provider, model: args.candidate.model } },
      });
    `;
    expect(findB4BenchCandidateHookBindingViolations(source)).toContain(
      "assertB4BenchCandidateDispatchAllowed must be called before candidate config construction",
    );
  });

  it("rejects B4 helper calls that occur after candidate config construction", () => {
    const source = `
      import { assertB4BenchCandidateDispatchAllowed } from "../src/core-runtime/discovery/supported-models.ts";
      const candidate = resolveLlmProviderConfig({
        config: { llm: { provider: args.candidate.provider, model: args.candidate.model } },
      });
      assertB4BenchCandidateDispatchAllowed({ provider: args.candidate.provider, model: args.candidate.model });
    `;
    expect(findB4BenchCandidateHookBindingViolations(source)).toContain(
      "assertB4BenchCandidateDispatchAllowed must run before the candidate resolveLlmProviderConfig call",
    );
  });
});
