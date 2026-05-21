import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
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
    [
      "llm:",
      "  auth: oauth",
      "  provider: openai",
      "  model: gpt-5.4",
      "  effort: high",
      "",
    ].join("\n"),
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
- Newly Learned
- Applied Learnings
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
- Unique Finding Tagging
- Axiology Integration
- Newly Learned
- Degraded Lens Failures
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
      expect(output).toContain("## Degraded Lens Failures");
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

  function buildSynthesizePacket(lensPaths: string[]): string {
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
      "## Required Output Sections",
      "- Consensus",
      "- Conditional Consensus",
      "- Disagreement",
      "- Deliberation Decision",
      "- Unique Finding Tagging",
      "- Axiology Integration",
      "- Newly Learned",
      "- Degraded Lens Failures",
      "",
    ].join("\n");
  }

  it("attaches citation_audit with 0 unmatched when synthesize quotes match lens pool", async () => {
    const round1 = writeLensPool({
      "axiology.md": "axiology content with the phrase (none — mock executor) inline.",
    });
    const packet = buildSynthesizePacket([path.join(round1, "axiology.md")]);
    const packetPath = writePacket("synthesize.packet.md", packet);
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
    expect(result.citation_audit).toBeDefined();
    expect(result.citation_audit.quotes_unmatched).toEqual([]);
    expect(result.citation_audit.min_quote_length).toBe(20);
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
      const packet = buildSynthesizePacket([path.join(round1, "axiology.md")]);
      const packetPath = writePacket("synthesize.packet.md", packet);
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

  it("skips audit (with STDERR notice) when every referenced lens file is unreadable", async () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const packet = buildSynthesizePacket([
        path.join(sessionRoot, "round1", "does-not-exist.md"),
      ]);
      const packetPath = writePacket("synthesize.packet.md", packet);
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
      expect(stderrChunks.join("")).toMatch(/citation audit skipped/);
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
  const TOOLS_REQUIRED_PACKET = `# Synthesize Prompt Packet (path-only)

You are the synthesize actor. Lens outputs live on disk.

## Boundary Policy
- Filesystem: read-only inside round1/
- Network: denied
- Tools: required

## Participating Lens Outputs
- axiology: .onto/review/session/round1/axiology.md

## Required Output Sections
- Consensus
- Conditional Consensus
- Disagreement
- Deliberation Decision
- Unique Finding Tagging
- Axiology Integration
- Newly Learned
- Degraded Lens Failures
`;

  it("rejects --tool-mode=inline with a clear fail-fast message", async () => {
    const packetPath = writePacket("synthesize.packet.md", TOOLS_REQUIRED_PACKET);
    const outputPath = path.join(sessionRoot, "synthesize.md");

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

  it("auto-promotes --tool-mode=auto to native when a tool-loop provider is available", async () => {
    const packetPath = writePacket("synthesize.packet.md", TOOLS_REQUIRED_PACKET);
    const outputPath = path.join(sessionRoot, "synthesize.md");

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

  it("rejects --tool-mode=auto when the resolved provider has no tool-loop support", async () => {
    const packetPath = writePacket("synthesize.packet.md", TOOLS_REQUIRED_PACKET);
    const outputPath = path.join(sessionRoot, "synthesize.md");

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
    const conflictingPacket = TOOLS_REQUIRED_PACKET.replace(
      "- Filesystem: read-only inside round1/",
      "- Filesystem: denied",
    );
    const packetPath = writePacket("synthesize.packet.md", conflictingPacket);
    const outputPath = path.join(sessionRoot, "synthesize.md");

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
