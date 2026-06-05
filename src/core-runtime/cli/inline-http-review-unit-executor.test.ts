import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInlineHttpReviewUnitExecutorCli } from "./inline-http-review-unit-executor.js";

let scratchDir: string;
let projectRoot: string;
let sessionRoot: string;
let ontoHome: string;
let savedHome: string | undefined;
let savedMock: string | undefined;
let consoleLogSpy: { restore: () => void; getOutput: () => string[] };

function captureConsoleLog(): typeof consoleLogSpy {
  const original = console.log;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => {
    captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return {
    restore: () => {
      console.log = original;
    },
    getOutput: () => captured,
  };
}

beforeEach(() => {
  scratchDir = mkdtempSync(path.join(tmpdir(), "inline-http-exec-test-"));
  projectRoot = path.join(scratchDir, "project");
  sessionRoot = path.join(scratchDir, "session");
  ontoHome = path.join(scratchDir, ".onto");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(sessionRoot, { recursive: true });
  mkdirSync(ontoHome, { recursive: true });
  mkdirSync(path.join(projectRoot, ".onto"), { recursive: true });
  writeFileSync(
    path.join(projectRoot, ".onto", "settings.json"),
    JSON.stringify(
      {
        schema_version: "settings.json/v3",
        review: {
          execution: {
            actors: {
              teamlead: {
                seat: "main",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-5.4",
                  effort: "high",
                },
              },
              lens: {
                seat: "worker",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-5.4",
                  effort: "high",
                },
              },
              synthesize: {
                seat: "worker",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-5.4",
                  effort: "high",
                },
              },
            },
          },
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  savedHome = process.env.HOME;
  process.env.HOME = scratchDir;
  savedMock = process.env.ONTO_LLM_MOCK;
  process.env.ONTO_LLM_MOCK = "1";

  consoleLogSpy = captureConsoleLog();
});

afterEach(() => {
  consoleLogSpy.restore();
  if (savedHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = savedHome;
  }
  if (savedMock === undefined) {
    delete process.env.ONTO_LLM_MOCK;
  } else {
    process.env.ONTO_LLM_MOCK = savedMock;
  }
  rmSync(scratchDir, { recursive: true, force: true });
});

function writePacket(filename: string, content: string): string {
  const packetPath = path.join(sessionRoot, filename);
  writeFileSync(packetPath, content, "utf8");
  return packetPath;
}

const PANEL_REVIEW_PACKET = `# Panel Review Prompt Packet

You are a review lens. Inspect the target and produce findings.

## Materialized Input
\`\`\`
function add(a: number, b: number): number {
  return a + b;
}
\`\`\`

## Boundary Policy
- Filesystem: read-only
- Network: denied

## Required Output Sections
- Structural Inspection
- Findings
- Domain Constraints Used
- Domain Context Assumptions
`;

describe("runInlineHttpReviewUnitExecutorCli — basic execution", () => {
  it("reads packet, calls mock LLM, writes output, prints JSON result", async () => {
    const packetPath = writePacket("lens-logic.packet.md", PANEL_REVIEW_PACKET);
    const outputPath = path.join(sessionRoot, "round1", "logic.md");

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "logic",
      "--unit-kind", "lens",
      "--packet-path", packetPath,
      "--output-path", outputPath,
    ]);

    expect(exitCode).toBe(0);

    const outputText = readFileSync(outputPath, "utf8");
    expect(outputText.length).toBeGreaterThan(0);

    const logs = consoleLogSpy.getOutput();
    expect(logs.length).toBeGreaterThan(0);
    const result = JSON.parse(logs.join(""));
    expect(result.unit_id).toBe("logic");
    expect(result.unit_kind).toBe("lens");
    expect(result.realization).toBe("ts_inline_http");
    expect(result.output_path).toBe(outputPath);
  });

  it("creates output directory if missing", async () => {
    const packetPath = writePacket("lens.packet.md", PANEL_REVIEW_PACKET);
    const outputPath = path.join(sessionRoot, "deeply", "nested", "round1", "logic.md");

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "logic",
      "--unit-kind", "lens",
      "--packet-path", packetPath,
      "--output-path", outputPath,
    ]);

    expect(exitCode).toBe(0);
    const outputText = readFileSync(outputPath, "utf8");
    expect(outputText.length).toBeGreaterThan(0);
  });

  it("respects --provider flag (anthropic explicit override)", async () => {
    const packetPath = writePacket("lens.packet.md", PANEL_REVIEW_PACKET);
    const outputPath = path.join(sessionRoot, "logic.md");

    // --tool-mode inline: these tests exercise provider override via the mock
    // provider, which doesn't exercise the tool-calling loop. Under the Phase
    // 3-2 default (--tool-mode auto) the executor would try native first and
    // require a resolved model id; inline keeps the test focused on host_runtime
    // propagation.
    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "logic",
      "--unit-kind", "lens",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--provider", "anthropic",
      "--tool-mode", "inline",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse(consoleLogSpy.getOutput().join(""));
    expect(result.host_runtime).toBe("anthropic");
  });

  it("respects --provider flag (lmstudio explicit override)", async () => {
    const packetPath = writePacket("lens.packet.md", PANEL_REVIEW_PACKET);
    const outputPath = path.join(sessionRoot, "logic.md");

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "logic",
      "--unit-kind", "lens",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--provider", "lmstudio",
      "--tool-mode", "inline",
    ]);

    // Note: with mock, host_runtime reports per --provider flag, not actual mock target
    expect(exitCode).toBe(0);
    const result = JSON.parse(consoleLogSpy.getOutput().join(""));
    expect(result.host_runtime).toBe("lmstudio");
  });
});

describe("runInlineHttpReviewUnitExecutorCli — error cases", () => {
  it("rejects missing required flag --unit-id", async () => {
    const packetPath = writePacket("lens.packet.md", PANEL_REVIEW_PACKET);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--unit-kind", "lens",
        "--packet-path", packetPath,
        "--output-path", path.join(sessionRoot, "out.md"),
      ]),
    ).rejects.toThrow(/--unit-id/);
  });

  it("rejects missing --packet-path", async () => {
    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--unit-id", "logic",
        "--unit-kind", "lens",
        "--output-path", path.join(sessionRoot, "out.md"),
      ]),
    ).rejects.toThrow(/--packet-path/);
  });
});

describe("runInlineHttpReviewUnitExecutorCli — synthesize code-fence strip (Phase 3-4 A2)", () => {
  const SYNTHESIZE_PACKET = `# Synthesize Prompt Packet

You are the synthesize actor. Consolidate lens outputs.

## Participating Lens Outputs
(none for mock test)

## Boundary Policy
- Filesystem: read-only
- Network: denied

## Required Output Sections
- Consensus
- Conditional Consensus
- Disagreement
- Deliberation Decision
- Axiology-Proposed Additional Perspectives
- Purpose Alignment Verification
- Final Review Result
- Boundary Notes
- Immediate Actions Required
- Recommendations
- Unique Finding Tagging
`;

  it("baseline: synthesize output has no wrapping code fence", async () => {
    const packetPath = writePacket("synthesize.packet.md", SYNTHESIZE_PACKET);
    const outputPath = path.join(sessionRoot, "synthesize.md");

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "synthesize",
      "--unit-kind", "synthesize",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--tool-mode", "inline",
    ]);

    expect(exitCode).toBe(0);
    const output = readFileSync(outputPath, "utf8");
    expect(output.startsWith("---\ndeliberation_status:")).toBe(true);
    expect(output.includes("```yaml")).toBe(false);
    expect(output.trimEnd().endsWith("```")).toBe(false);
  });

  it("strips ```yaml wrapping fence when the mock returns a wrapped synthesize response", async () => {
    const savedWrapHook = process.env.ONTO_LLM_MOCK_SYNTHESIZE_WRAP_FENCE;
    process.env.ONTO_LLM_MOCK_SYNTHESIZE_WRAP_FENCE = "1";
    try {
      const packetPath = writePacket("synthesize.packet.md", SYNTHESIZE_PACKET);
      const outputPath = path.join(sessionRoot, "synthesize.md");

      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "inline",
      ]);

      expect(exitCode).toBe(0);
      const output = readFileSync(outputPath, "utf8");
      // Even though the mock wrapped the body in ```yaml ... ```, the executor
      // must have stripped the outer fence before writing the canonical file.
      expect(output.startsWith("---\ndeliberation_status:")).toBe(true);
      expect(output.includes("```yaml")).toBe(false);
      expect(output.trimEnd().endsWith("```")).toBe(false);
      // The required section headings must still be present — strip must not
      // have damaged the markdown body.
      expect(output).toContain("## Consensus");
      expect(output).toContain("## Boundary Notes");
    } finally {
      if (savedWrapHook === undefined) {
        delete process.env.ONTO_LLM_MOCK_SYNTHESIZE_WRAP_FENCE;
      } else {
        process.env.ONTO_LLM_MOCK_SYNTHESIZE_WRAP_FENCE = savedWrapHook;
      }
    }
  });
});

describe("runInlineHttpReviewUnitExecutorCli — embed flag", () => {
  it("--embed-domain-docs expands domain doc references in packet", async () => {
    const domainsDir = path.join(ontoHome, "domains", "test-domain");
    mkdirSync(domainsDir, { recursive: true });
    writeFileSync(
      path.join(domainsDir, "logic_rules.md"),
      "## Inline Test Logic\nRule: test rule\n",
      "utf8",
    );

    const packetWithRef = `${PANEL_REVIEW_PACKET}

## Domain Documents
- Primary: ~/.onto/domains/test-domain/logic_rules.md
`;
    const packetPath = writePacket("lens.packet.md", packetWithRef);
    const outputPath = path.join(sessionRoot, "logic.md");

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "logic",
      "--unit-kind", "lens",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--embed-domain-docs",
    ]);

    expect(exitCode).toBe(0);
    // Mock provider doesn't echo prompt, but successful exit + output written
    // confirms the embedding pipeline ran without error.
    const output = readFileSync(outputPath, "utf8");
    expect(output.length).toBeGreaterThan(0);
  });
});

describe("runInlineHttpReviewUnitExecutorCli — citation audit (Phase 3-4 A5)", () => {
  function writeLensPool(files: Record<string, string>): string {
    const round1 = path.join(sessionRoot, "round1");
    mkdirSync(round1, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(path.join(round1, name), body, "utf8");
    }
    return round1;
  }

  function buildSynthesizePacket(
    lensPaths: string[],
    boundary?: {
      unitId?: string;
      outputPath: string;
      allowedReadRefs: string[];
      allowedOutputRefs?: string[];
    },
  ): string {
    return [
      "# Synthesize Prompt Packet (A5 audit test)",
      "",
      "You are the synthesize actor.",
      "",
      "## Boundary Policy",
      "- Filesystem: read-only",
      "- Network: denied",
      "",
      "## Participating Lens Outputs",
      ...lensPaths.map((p, i) => `- lens${i}: ${p}`),
      "",
      ...(boundary
        ? [
            "## Unit Boundary Details",
            "```json",
            JSON.stringify({
              unit_boundary: {
                unit_id: boundary.unitId ?? "synthesize",
                read_authority: {
                  allowed_read_refs: boundary.allowedReadRefs,
                },
                output_seat: {
                  output_path: boundary.outputPath,
                  allowed_output_refs: boundary.allowedOutputRefs ?? [
                    boundary.outputPath,
                  ],
                },
              },
            }),
            "```",
            "",
          ]
        : []),
      "## Required Output Sections",
      "- Consensus",
      "- Conditional Consensus",
      "- Disagreement",
      "- Deliberation Decision",
      "- Axiology-Proposed Additional Perspectives",
      "- Purpose Alignment Verification",
      "- Final Review Result",
      "- Boundary Notes",
      "- Immediate Actions Required",
      "- Recommendations",
      "- Unique Finding Tagging",
      "",
    ].join("\n");
  }

  it("attaches citation_audit with 0 unmatched when synthesize quotes match lens pool", async () => {
    const round1 = writeLensPool({
      "axiology.md": "axiology content with the phrase (none — mock executor) inline.",
    });
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const lensPath = path.join(round1, "axiology.md");
    const packet = buildSynthesizePacket([lensPath], {
      outputPath,
      allowedReadRefs: [lensPath],
    });
    const packetPath = writePacket("synthesize.packet.md", packet);

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "synthesize",
      "--unit-kind", "synthesize",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--tool-mode", "inline",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse(consoleLogSpy.getOutput().join(""));
    expect(result.citation_audit).toBeDefined();
    expect(result.citation_audit.status).toBe("completed");
    expect(result.citation_audit.coverage_status).toBe("complete");
    expect(result.citation_audit.quotes_unmatched).toEqual([]);
    expect(result.citation_audit.min_quote_length).toBe(20);
  });

  it("keeps citation_audit when embedded target text contains a participating-lens heading", async () => {
    const round1 = writeLensPool({
      "logic.md": "logic content with the phrase (none — mock executor) inline.",
    });
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const lensPath = path.join(round1, "logic.md");
    const packet = buildSynthesizePacket([lensPath], {
      outputPath,
      allowedReadRefs: [lensPath],
    }).replace(
      "## Boundary Policy",
      [
        "## Embedded Materialized Input",
        "<!-- onto:embedded-materialized-input:start lines=2 -->",
        "## Participating Lens Outputs",
        "- fake: target-body.md",
        "<!-- onto:embedded-materialized-input:end -->",
        "",
        "## Boundary Policy",
      ].join("\n"),
    );
    const packetPath = writePacket("synthesize.embedded-heading.packet.md", packet);

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "synthesize",
      "--unit-kind", "synthesize",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--tool-mode", "inline",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse(consoleLogSpy.getOutput().join(""));
    expect(result.citation_audit).toMatchObject({
      status: "completed",
      coverage_status: "complete",
    });
    expect(result.citation_audit.failed_refs).toBeUndefined();
  });

  it("preserves partial citation_audit coverage when some lens refs are unreadable", async () => {
    const round1 = writeLensPool({
      "logic.md": "logic content with the phrase (none — mock executor) inline.",
    });
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const lensPath = path.join(round1, "logic.md");
    const missingLensPath = path.join(round1, "missing.md");
    const packet = buildSynthesizePacket([lensPath, missingLensPath], {
      outputPath,
      allowedReadRefs: [round1],
    });
    const packetPath = writePacket("synthesize.partial-audit.packet.md", packet);

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "synthesize",
      "--unit-kind", "synthesize",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--tool-mode", "inline",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse(consoleLogSpy.getOutput().join(""));
    expect(result.citation_audit).toMatchObject({
      status: "completed",
      coverage_status: "partial",
      failed_refs: [expect.stringContaining("missing.md: unreadable or missing")],
    });
  });

  it("keeps citation_audit partial when an exact allowed_read_refs entry is missing", async () => {
    const round1 = writeLensPool({
      "logic.md": "logic content with the phrase (none — mock executor) inline.",
    });
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const lensPath = path.join(round1, "logic.md");
    const missingLensPath = path.join(round1, "missing.md");
    const packet = buildSynthesizePacket([lensPath, missingLensPath], {
      outputPath,
      allowedReadRefs: [lensPath, missingLensPath],
    });
    const packetPath = writePacket(
      "synthesize.partial-audit-exact-refs.packet.md",
      packet,
    );

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "synthesize",
      "--unit-kind", "synthesize",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--tool-mode", "inline",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse(consoleLogSpy.getOutput().join(""));
    expect(result.citation_audit).toMatchObject({
      status: "completed",
      coverage_status: "partial",
      failed_refs: [expect.stringContaining("missing.md: unreadable or missing")],
    });
  });

  it("mock synthesize derives expected lenses from degraded failures when directive is absent", async () => {
    const round1 = writeLensPool({
      "logic.md": "logic lens content with the phrase (none — mock executor) inline.",
    });
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const lensPath = path.join(round1, "logic.md");
    const packet = [
      buildSynthesizePacket([lensPath], {
        outputPath,
        allowedReadRefs: [lensPath],
      }),
      "",
      "## Degraded Lens Failures",
      "- pragmatics: simulated failure",
      "",
    ].join("\n");
    const packetPath = writePacket("synthesize.degraded.packet.md", packet);

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "synthesize",
      "--unit-kind", "synthesize",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--tool-mode", "inline",
    ]);

    expect(exitCode).toBe(0);
    const output = readFileSync(outputPath, "utf8");
    expect(output).toContain("expected_lenses:");
    expect(output).toContain('- "lens0"');
    expect(output).toContain('- "pragmatics"');
    expect(output).toContain("missing_or_failed_lenses:");
    expect(output).toContain('lens_id: "pragmatics"');
    expect(output).toContain("run_status: degraded");
  });

  it("flags fabricated quote via ONTO_LLM_MOCK_SYNTHESIZE_FABRICATE=1", async () => {
    const savedHook = process.env.ONTO_LLM_MOCK_SYNTHESIZE_FABRICATE;
    process.env.ONTO_LLM_MOCK_SYNTHESIZE_FABRICATE = "1";

    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const round1 = writeLensPool({
        "axiology.md": "axiology content with legitimate findings about value alignment.",
      });
      const outputPath = path.join(sessionRoot, "synthesize.md");
      const lensPath = path.join(round1, "axiology.md");
      const packet = buildSynthesizePacket([lensPath], {
        outputPath,
        allowedReadRefs: [lensPath],
      });
      const packetPath = writePacket("synthesize.packet.md", packet);

      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "inline",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.citation_audit.quotes_unmatched).toContain(
        "A fabricated quote that is definitely nowhere in the lens pool for this mock test run",
      );
      const stderrText = stderrChunks.join("");
      expect(stderrText).toMatch(/citation audit WARNING/);
      expect(stderrText).toMatch(/may indicate fabrication/);
    } finally {
      process.stderr.write = originalWrite;
      if (savedHook === undefined) {
        delete process.env.ONTO_LLM_MOCK_SYNTHESIZE_FABRICATE;
      } else {
        process.env.ONTO_LLM_MOCK_SYNTHESIZE_FABRICATE = savedHook;
      }
    }
  });

  it("skips audit (no citation_audit field) when packet has no Participating Lens Outputs", async () => {
    // Use the basic panel-review packet which has no Participating Lens Outputs.
    const packetPath = writePacket("lens.packet.md", PANEL_REVIEW_PACKET);
    const outputPath = path.join(sessionRoot, "synthesize.md");

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "synthesize",
      "--unit-kind", "synthesize",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--tool-mode", "inline",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse(consoleLogSpy.getOutput().join(""));
    expect(result.citation_audit).toBeUndefined();
  });

  it("skips citation audit when Unit Boundary Details are missing even if lens path is readable", async () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const round1 = writeLensPool({
        "logic.md": "logic lens content with the phrase (none — mock executor) inline.",
      });
      const packet = buildSynthesizePacket([path.join(round1, "logic.md")]);
      const packetPath = writePacket("synthesize.missing-boundary.packet.md", packet);
      const outputPath = path.join(sessionRoot, "synthesize.md");

      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "inline",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.citation_audit).toMatchObject({
        status: "skipped",
        coverage_status: "none",
        skip_reason: expect.stringContaining("missing Unit Boundary Details"),
      });
      const stderrText = stderrChunks.join("");
      expect(stderrText).toMatch(/citation audit skipped/);
      expect(stderrText).toMatch(/missing Unit Boundary Details/);
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it("skips citation audit when Unit Boundary Details are malformed", async () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const round1 = writeLensPool({
        "logic.md": "logic lens content with the phrase (none — mock executor) inline.",
      });
      const outputPath = path.join(sessionRoot, "synthesize.md");
      const packet = [
        buildSynthesizePacket([path.join(round1, "logic.md")]),
        "",
        "## Unit Boundary Details",
        "```json",
        "{nope",
        "```",
      ].join("\n");
      const packetPath = writePacket("synthesize.malformed-boundary.packet.md", packet);

      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "inline",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.citation_audit).toMatchObject({
        status: "skipped",
        coverage_status: "none",
        skip_reason: expect.stringContaining("malformed unit_boundary"),
      });
      const stderrText = stderrChunks.join("");
      expect(stderrText).toMatch(/citation audit skipped/);
      expect(stderrText).toMatch(/malformed unit_boundary/);
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it("skips audit (with STDERR notice) when every referenced lens file is unreadable", async () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const outputPath = path.join(sessionRoot, "synthesize.md");
      const missingLensPath = path.join(sessionRoot, "round1", "does-not-exist.md");
      const packet = buildSynthesizePacket([missingLensPath], {
        outputPath,
        allowedReadRefs: [sessionRoot],
      });
      const packetPath = writePacket("synthesize.packet.md", packet);

      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "inline",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.citation_audit).toMatchObject({
        status: "skipped",
        coverage_status: "none",
        skip_reason: expect.stringContaining("no lens outputs readable"),
      });
      expect(stderrChunks.join("")).toMatch(/citation audit skipped/);
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it("does not read citation-audit lens paths outside the project root", async () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    let outsideDir: string | null = null;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      outsideDir = mkdtempSync(path.join(tmpdir(), "onto-outside-lens-"));
      const outsidePath = path.join(outsideDir, "outside.md");
      writeFileSync(
        outsidePath,
        "outside lens content with the phrase (none — mock executor) inline.",
        "utf8",
      );
      const outputPath = path.join(sessionRoot, "synthesize.md");
      const packet = buildSynthesizePacket(
        [outsidePath, path.join("..", path.basename(outsideDir), "outside.md")],
        {
          outputPath,
          allowedReadRefs: [sessionRoot],
        },
      );
      const packetPath = writePacket("synthesize.outside.packet.md", packet);

      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "inline",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.citation_audit).toMatchObject({
        status: "skipped",
        coverage_status: "none",
        skip_reason: expect.stringContaining("no lens outputs readable"),
      });
      const stderrText = stderrChunks.join("");
      expect(stderrText).toMatch(/citation audit skipped/);
      expect(stderrText).toMatch(/outside allowed root/);
    } finally {
      process.stderr.write = originalWrite;
      if (outsideDir) rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("does not follow citation-audit symlinks that realpath outside the project root", async () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    let outsideDir: string | null = null;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      outsideDir = mkdtempSync(path.join(tmpdir(), "onto-outside-lens-"));
      const outsidePath = path.join(outsideDir, "outside.md");
      writeFileSync(
        outsidePath,
        "outside lens content with the phrase (none — mock executor) inline.",
        "utf8",
      );
      const round1 = path.join(sessionRoot, "round1");
      mkdirSync(round1, { recursive: true });
      const linkedPath = path.join(round1, "linked.md");
      symlinkSync(outsidePath, linkedPath);
      const outputPath = path.join(sessionRoot, "synthesize.md");
      const packet = buildSynthesizePacket([linkedPath], {
        outputPath,
        allowedReadRefs: [round1],
      });
      const packetPath = writePacket("synthesize.symlink.packet.md", packet);

      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "inline",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.citation_audit).toMatchObject({
        status: "skipped",
        coverage_status: "none",
        skip_reason: expect.stringContaining("no lens outputs readable"),
      });
      const stderrText = stderrChunks.join("");
      expect(stderrText).toMatch(/citation audit skipped/);
      expect(stderrText).toMatch(/outside allowed root/);
    } finally {
      process.stderr.write = originalWrite;
      if (outsideDir) rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("skips citation-audit lens paths outside unit allowed_read_refs", async () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const round1 = writeLensPool({
        "logic.md": "logic lens content with the phrase (none — mock executor) inline.",
      });
      const lensPath = path.join(round1, "logic.md");
      const outputPath = path.join(sessionRoot, "synthesize.md");
      const authorityPath = path.join(projectRoot, ".onto", "settings.json");
      const packet = buildSynthesizePacket([lensPath], {
        outputPath,
        allowedReadRefs: [authorityPath],
      });
      const packetPath = writePacket("synthesize.disallowed-audit.packet.md", packet);

      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "inline",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.citation_audit).toMatchObject({
        status: "skipped",
        coverage_status: "none",
        skip_reason: expect.stringContaining("no lens outputs readable"),
      });
      const stderrText = stderrChunks.join("");
      expect(stderrText).toMatch(/citation audit skipped/);
      expect(stderrText).toMatch(/outside allowed_read_refs/);
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it("does not audit lens-kind units", async () => {
    const packetPath = writePacket("lens.packet.md", PANEL_REVIEW_PACKET);
    const outputPath = path.join(sessionRoot, "logic.md");

    const exitCode = await runInlineHttpReviewUnitExecutorCli([
      "--project-root", projectRoot,
      "--session-root", sessionRoot,
      "--onto-home", ontoHome,
      "--unit-id", "logic",
      "--unit-kind", "lens",
      "--packet-path", packetPath,
      "--output-path", outputPath,
      "--tool-mode", "inline",
    ]);

    expect(exitCode).toBe(0);
    const result = JSON.parse(consoleLogSpy.getOutput().join(""));
    expect(result.citation_audit).toBeUndefined();
  });
});

describe("runInlineHttpReviewUnitExecutorCli — Tools: required precedence (Phase 3-4 A4)", () => {
  function toolsRequiredPacket(
    outputPath = path.join(sessionRoot, "synthesize.md"),
  ): string {
    return `# Synthesize Prompt Packet (path-only)

You are the synthesize actor. Lens outputs live on disk.

## Boundary Policy
- Filesystem: read-only inside round1/
- Network: denied
- Tools: required

## Participating Lens Outputs
- axiology: .onto/review/session/round1/axiology.md

## Unit Boundary Details
\`\`\`json
${JSON.stringify({
  unit_boundary: {
    unit_id: "synthesize",
    read_authority: {
      allowed_read_refs: [".onto/review/session/round1/axiology.md"],
    },
    output_seat: {
      output_path: outputPath,
      allowed_output_refs: [outputPath],
    },
  },
})}
\`\`\`

## Required Output Sections
- Consensus
- Conditional Consensus
- Disagreement
- Deliberation Decision
- Axiology-Proposed Additional Perspectives
- Purpose Alignment Verification
- Final Review Result
- Boundary Notes
- Immediate Actions Required
- Recommendations
- Unique Finding Tagging
`;
  }

  function toolsRequiredPacketWithoutReadAuthority(outputPath: string): string {
    return toolsRequiredPacket(outputPath).replace(
      /\n## Unit Boundary Details\n```json\n[\s\S]*?\n```\n/,
      "\n",
    );
  }

  const TOOLS_DENIED_PACKET = `# Lens Prompt Packet (inline-only)

You are a review lens. Everything needed is embedded in this packet.

## Boundary Policy
- Filesystem: read-only
- Network: denied
- Tools: denied

## Materialized Input
\`\`\`
export const value = 1;
\`\`\`

## Required Output Sections
- Findings
`;

  function toolsOptionalWithReadAuthorityPacket(
    outputPath = path.join(sessionRoot, "logic.md"),
  ): string {
    return `# Lens Prompt Packet (auto-native eligible)

You are a review lens. Use tools if helpful.

## Boundary Policy
- Filesystem: read-only
- Network: denied
- Tools: optional

## Unit Boundary Details
\`\`\`json
${JSON.stringify({
  unit_boundary: {
    unit_id: "logic",
    read_authority: {
      allowed_read_refs: [path.join(projectRoot, ".onto", "settings.json")],
    },
    output_seat: {
      output_path: outputPath,
      allowed_output_refs: [outputPath],
    },
  },
})}
\`\`\`

## Materialized Input
\`\`\`
export const value = 1;
\`\`\`

## Required Output Sections
- Findings
`;
  }

  it("rejects --tool-mode=inline with a clear fail-fast message", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packetPath = writePacket(
      "synthesize.packet.md",
      toolsRequiredPacket(outputPath),
    );

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "inline",
      ]),
    ).rejects.toThrow(/Tools: required|fabricated citations/);
  });

  it("rejects --tool-mode=native when packet declares Tools: denied", async () => {
    const packetPath = writePacket("lens.packet.md", TOOLS_DENIED_PACKET);
    const outputPath = path.join(sessionRoot, "logic.md");

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "logic",
        "--unit-kind", "lens",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "native",
      ]),
    ).rejects.toThrow(/Tools: denied|no tool access/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("downgrades --tool-mode=auto to inline when packet declares Tools: denied", async () => {
    const packetPath = writePacket("lens.packet.md", TOOLS_DENIED_PACKET);
    const outputPath = path.join(sessionRoot, "logic.md");

    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "logic",
        "--unit-kind", "lens",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]);

      expect(exitCode).toBe(0);
      const stderrText = stderrChunks.join("");
      expect(stderrText).toMatch(/downgraded to inline/);
      expect(stderrText).toMatch(/Tools: denied/);

      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.packet_policy_downgrade).toBe(true);
      expect(result.tool_mode).toBe("inline");
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it("auto-promotes --tool-mode=auto to native when a tool-loop provider is available", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packetPath = writePacket(
      "synthesize.packet.md",
      toolsRequiredPacket(outputPath),
    );

    // Capture STDERR to verify the promotion notice is emitted.
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]);

      expect(exitCode).toBe(0);
      const stderrText = stderrChunks.join("");
      expect(stderrText).toMatch(/auto-promoted to tool-native/);
      expect(stderrText).toMatch(/Tools: required/);

      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.packet_policy_promotion).toBe(true);
      expect(result.tool_mode).toBe("native");
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it("passes actor api_key_env through tool-native config", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packetPath = writePacket(
      "synthesize.packet.md",
      toolsRequiredPacket(outputPath),
    );
    const savedEchoHook = process.env.ONTO_LLM_MOCK_TOOL_LOOP_ECHO_CONFIG;
    process.env.ONTO_LLM_MOCK_TOOL_LOOP_ECHO_CONFIG = "1";

    try {
      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--api-key-env", "CUSTOM_OPENAI_API_KEY",
        "--tool-mode", "auto",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.tool_mode).toBe("native");
      expect(readFileSync(outputPath, "utf8")).toContain(
        "api_key_env: CUSTOM_OPENAI_API_KEY",
      );
    } finally {
      if (savedEchoHook === undefined) {
        delete process.env.ONTO_LLM_MOCK_TOOL_LOOP_ECHO_CONFIG;
      } else {
        process.env.ONTO_LLM_MOCK_TOOL_LOOP_ECHO_CONFIG = savedEchoHook;
      }
    }
  });

  it("preserves attempted-native boundary skips when auto-native falls back to inline", async () => {
    const outputPath = path.join(sessionRoot, "logic.md");
    const packetPath = writePacket(
      "lens.packet.md",
      toolsOptionalWithReadAuthorityPacket(outputPath),
    );
    const savedEmptyHook = process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY;
    const savedSkipHook = process.env.ONTO_LLM_MOCK_TOOL_LOOP_BOUNDARY_SKIP;
    process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY = "1";
    process.env.ONTO_LLM_MOCK_TOOL_LOOP_BOUNDARY_SKIP = "1";

    try {
      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "logic",
        "--unit-kind", "lens",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.tool_mode).toBe("inline");
      expect(result.tool_boundary_skips).toBeUndefined();
      expect(result.native_admission).toMatchObject({
        requested_tool_mode: "auto",
        effective_tool_mode: "inline",
        decision: "native_downgraded_inline",
        attempted_native_tool_boundary_skips: {
          boundary_skips: 1,
          unreadable_skips: 0,
          oversized_skips: 0,
        },
      });
    } finally {
      if (savedEmptyHook === undefined) {
        delete process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY;
      } else {
        process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY = savedEmptyHook;
      }
      if (savedSkipHook === undefined) {
        delete process.env.ONTO_LLM_MOCK_TOOL_LOOP_BOUNDARY_SKIP;
      } else {
        process.env.ONTO_LLM_MOCK_TOOL_LOOP_BOUNDARY_SKIP = savedSkipHook;
      }
    }
  });

  it("preserves attempted-native boundary skips when auto-native throws before inline downgrade", async () => {
    const outputPath = path.join(sessionRoot, "logic.md");
    const packetPath = writePacket(
      "lens.packet.md",
      toolsOptionalWithReadAuthorityPacket(outputPath),
    );
    const savedThrowHook = process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW;
    const savedSkipHook = process.env.ONTO_LLM_MOCK_TOOL_LOOP_BOUNDARY_SKIP;
    process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW = "1";
    process.env.ONTO_LLM_MOCK_TOOL_LOOP_BOUNDARY_SKIP = "1";

    try {
      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "logic",
        "--unit-kind", "lens",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]);

      expect(exitCode).toBe(0);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.tool_mode).toBe("inline");
      expect(result.tool_boundary_skips).toBeUndefined();
      expect(result.native_admission).toMatchObject({
        requested_tool_mode: "auto",
        effective_tool_mode: "inline",
        decision: "native_downgraded_inline",
        reason: "mock tool-loop failure",
        attempted_native_tool_boundary_skips: {
          boundary_skips: 1,
          unreadable_skips: 0,
          oversized_skips: 0,
        },
      });
    } finally {
      if (savedThrowHook === undefined) {
        delete process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW;
      } else {
        process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW = savedThrowHook;
      }
      if (savedSkipHook === undefined) {
        delete process.env.ONTO_LLM_MOCK_TOOL_LOOP_BOUNDARY_SKIP;
      } else {
        process.env.ONTO_LLM_MOCK_TOOL_LOOP_BOUNDARY_SKIP = savedSkipHook;
      }
    }
  });

  it("rejects packet-forced native when Unit Boundary Details are missing", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packetPath = writePacket(
      "synthesize.packet.md",
      toolsRequiredPacketWithoutReadAuthority(outputPath),
    );

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/Unit Boundary Details|allowed_read_refs/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects packet-forced native when allowed_read_refs are malformed", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const malformedPacket = toolsRequiredPacket(outputPath).replace(
      /```json\n[\s\S]*?\n```/,
      "```json\n{nope\n```",
    );
    const packetPath = writePacket("synthesize.packet.md", malformedPacket);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/malformed|allowed_read_refs/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects packet-forced native when allowed_read_refs are empty", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const emptyRefsPacket = toolsRequiredPacket(outputPath).replace(
      '"allowed_read_refs":[".onto/review/session/round1/axiology.md"]',
      '"allowed_read_refs":[]',
    );
    const packetPath = writePacket("synthesize.packet.md", emptyRefsPacket);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/empty|allowed_read_refs/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects packet-forced native when allowed_read_refs mix valid and invalid entries", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const mixedRefsPacket = toolsRequiredPacket(outputPath).replace(
      '"allowed_read_refs":[".onto/review/session/round1/axiology.md"]',
      '"allowed_read_refs":[".onto/review/session/round1/axiology.md",42]',
    );
    const packetPath = writePacket("synthesize.packet.md", mixedRefsPacket);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/malformed|allowed_read_refs/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects packet-forced native when Unit Boundary Details are duplicated", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const duplicatePacket = [
      toolsRequiredPacket(outputPath),
      "",
      "## Runtime Unit Boundary Details",
      "```json",
      JSON.stringify({
        unit_boundary: {
          read_authority: {
            allowed_read_refs: [".onto/review/session/round1/logic.md"],
          },
        },
      }),
      "```",
    ].join("\n");
    const packetPath = writePacket("synthesize.packet.md", duplicatePacket);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/multiple Unit Boundary Details/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects packet-forced native when Unit Boundary Details omit unit_id", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packet = [
      "# Synthesize Prompt Packet",
      "",
      "## Boundary Policy",
      "- Filesystem: read-only",
      "- Network: denied",
      "- Tools: required",
      "",
      "## Unit Boundary Details",
      "```json",
      JSON.stringify({
        unit_boundary: {
          read_authority: {
            allowed_read_refs: [path.join(projectRoot, ".onto", "settings.json")],
          },
          output_seat: {
            output_path: outputPath,
            allowed_output_refs: [outputPath],
          },
        },
      }),
      "```",
    ].join("\n");
    const packetPath = writePacket("synthesize.missing-unit-id.packet.md", packet);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/missing unit_boundary\.unit_id/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects packet-forced native when Unit Boundary Details omit output_path", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packet = [
      "# Synthesize Prompt Packet",
      "",
      "## Boundary Policy",
      "- Filesystem: read-only",
      "- Network: denied",
      "- Tools: required",
      "",
      "## Unit Boundary Details",
      "```json",
      JSON.stringify({
        unit_boundary: {
          unit_id: "synthesize",
          read_authority: {
            allowed_read_refs: [path.join(projectRoot, ".onto", "settings.json")],
          },
          output_seat: {
            allowed_output_refs: [outputPath],
          },
        },
      }),
      "```",
    ].join("\n");
    const packetPath = writePacket("synthesize.missing-output-path.packet.md", packet);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/missing unit_boundary\.output_seat\.output_path/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects packet-forced native when Unit Boundary Details belong to another unit", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packet = [
      "# Synthesize Prompt Packet",
      "",
      "## Boundary Policy",
      "- Filesystem: read-only",
      "- Network: denied",
      "- Tools: required",
      "",
      "## Unit Boundary Details",
      "```json",
      JSON.stringify({
        unit_boundary: {
          unit_id: "other-unit",
          read_authority: {
            allowed_read_refs: ["README.md"],
          },
          output_seat: {
            output_path: outputPath,
            allowed_output_refs: [outputPath],
          },
        },
      }),
      "```",
    ].join("\n");
    const packetPath = writePacket("synthesize.wrong-unit.packet.md", packet);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/unit_boundary\.unit_id mismatch/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects packet-forced native when Unit Boundary Details declare another output path", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const otherOutputPath = path.join(sessionRoot, "other-synthesize.md");
    const packet = [
      "# Synthesize Prompt Packet",
      "",
      "## Boundary Policy",
      "- Filesystem: read-only",
      "- Network: denied",
      "- Tools: required",
      "",
      "## Unit Boundary Details",
      "```json",
      JSON.stringify({
        unit_boundary: {
          unit_id: "synthesize",
          read_authority: {
            allowed_read_refs: ["README.md"],
          },
          output_seat: {
            output_path: otherOutputPath,
            allowed_output_refs: [otherOutputPath],
          },
        },
      }),
      "```",
    ].join("\n");
    const packetPath = writePacket("synthesize.wrong-output.packet.md", packet);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/unit_boundary\.output_seat\.output_path mismatch/);
    expect(existsSync(outputPath)).toBe(false);
    expect(existsSync(otherOutputPath)).toBe(false);
  });

  it("rejects packet-forced native when allowed_output_refs omit the output path", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const otherOutputPath = path.join(sessionRoot, "other-synthesize.md");
    const packet = [
      "# Synthesize Prompt Packet",
      "",
      "## Boundary Policy",
      "- Filesystem: read-only",
      "- Network: denied",
      "- Tools: required",
      "",
      "## Unit Boundary Details",
      "```json",
      JSON.stringify({
        unit_boundary: {
          unit_id: "synthesize",
          read_authority: {
            allowed_read_refs: [path.join(projectRoot, ".onto", "settings.json")],
          },
          output_seat: {
            output_path: outputPath,
            allowed_output_refs: [otherOutputPath],
          },
        },
      }),
      "```",
    ].join("\n");
    const packetPath = writePacket("synthesize.wrong-output-ref.packet.md", packet);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/allowed_output_refs does not include output path/);
    expect(existsSync(outputPath)).toBe(false);
    expect(existsSync(otherOutputPath)).toBe(false);
  });

  it("rejects explicit native mode when Unit Boundary Details are missing", async () => {
    const packetPath = writePacket("lens.packet.md", PANEL_REVIEW_PACKET);
    const outputPath = path.join(sessionRoot, "logic.md");

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "logic",
        "--unit-kind", "lens",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "native",
      ]),
    ).rejects.toThrow(/Unit Boundary Details|allowed_read_refs/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("downgrades opportunistic auto-native to inline when read authority is missing", async () => {
    const packetPath = writePacket("lens.packet.md", PANEL_REVIEW_PACKET);
    const outputPath = path.join(sessionRoot, "logic.md");

    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const exitCode = await runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "logic",
        "--unit-kind", "lens",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "openai",
        "--model", "mock-model",
        "--tool-mode", "auto",
      ]);

      expect(exitCode).toBe(0);
      expect(stderrChunks.join("")).toMatch(/allowed_read_refs|read authority/);
      const result = JSON.parse(consoleLogSpy.getOutput().join(""));
      expect(result.tool_mode).toBe("inline");
      expect(result.packet_policy_downgrade).toBeUndefined();
      expect(result.native_admission).toMatchObject({
        requested_tool_mode: "auto",
        effective_tool_mode: "inline",
        decision: "read_authority_forced_inline",
        read_authority_declared: false,
        read_authority_malformed: false,
      });
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it("keeps packet-forced native as fail-loud when native auto execution fails", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packetPath = writePacket(
      "synthesize.packet.md",
      toolsRequiredPacket(outputPath),
    );
    const savedHook = process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW;
    process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW = "1";

    try {
      await expect(
        runInlineHttpReviewUnitExecutorCli([
          "--project-root", projectRoot,
          "--session-root", sessionRoot,
          "--onto-home", ontoHome,
          "--unit-id", "synthesize",
          "--unit-kind", "synthesize",
          "--packet-path", packetPath,
          "--output-path", outputPath,
          "--provider", "openai",
          "--model", "mock-model",
          "--tool-mode", "auto",
        ]),
      ).rejects.toThrow(/mock tool-loop failure/);
      expect(existsSync(outputPath)).toBe(false);
      expect(consoleLogSpy.getOutput().join("")).not.toContain('"tool_mode":"inline"');
    } finally {
      if (savedHook === undefined) {
        delete process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW;
      } else {
        process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW = savedHook;
      }
    }
  });

  it("keeps packet-forced native as fail-loud when native auto returns empty output", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packetPath = writePacket(
      "synthesize.packet.md",
      toolsRequiredPacket(outputPath),
    );
    const savedHook = process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY;
    process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY = "1";

    try {
      await expect(
        runInlineHttpReviewUnitExecutorCli([
          "--project-root", projectRoot,
          "--session-root", sessionRoot,
          "--onto-home", ontoHome,
          "--unit-id", "synthesize",
          "--unit-kind", "synthesize",
          "--packet-path", packetPath,
          "--output-path", outputPath,
          "--provider", "openai",
          "--model", "mock-model",
          "--tool-mode", "auto",
        ]),
      ).rejects.toThrow(/tool-native mode produced empty final text/);
      expect(existsSync(outputPath)).toBe(false);
      expect(consoleLogSpy.getOutput().join("")).not.toContain('"tool_mode":"inline"');
    } finally {
      if (savedHook === undefined) {
        delete process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY;
      } else {
        process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY = savedHook;
      }
    }
  });

  it("rejects --tool-mode=auto when the resolved provider has no tool-loop support", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const packetPath = writePacket(
      "synthesize.packet.md",
      toolsRequiredPacket(outputPath),
    );

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--provider", "codex",
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/Tools: required|function-calling tool loop/);
  });

  it("rejects a packet that simultaneously denies filesystem and requires tools", async () => {
    const outputPath = path.join(sessionRoot, "synthesize.md");
    const conflictingPacket = toolsRequiredPacket(outputPath).replace(
      "- Filesystem: read-only inside round1/",
      "- Filesystem: denied",
    );
    const packetPath = writePacket("synthesize.packet.md", conflictingPacket);

    await expect(
      runInlineHttpReviewUnitExecutorCli([
        "--project-root", projectRoot,
        "--session-root", sessionRoot,
        "--onto-home", ontoHome,
        "--unit-id", "synthesize",
        "--unit-kind", "synthesize",
        "--packet-path", packetPath,
        "--output-path", outputPath,
        "--tool-mode", "auto",
      ]),
    ).rejects.toThrow(/internally inconsistent/);
  });
});
