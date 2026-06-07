import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import { runCodexReviewUnitExecutorCli } from "./codex-review-unit-executor.js";

let scratchDir: string;
let projectRoot: string;
let sessionRoot: string;
let savedPath: string | undefined;

beforeEach(() => {
  scratchDir = mkdtempSync(path.join(tmpdir(), "codex-review-unit-exec-test-"));
  projectRoot = path.join(scratchDir, "project");
  sessionRoot = path.join(scratchDir, "session", "20260607-test-session");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(sessionRoot, { recursive: true });
  savedPath = process.env.PATH;
});

afterEach(() => {
  if (savedPath === undefined) {
    delete process.env.PATH;
  } else {
    process.env.PATH = savedPath;
  }
  rmSync(scratchDir, { recursive: true, force: true });
});

function installFakeCodex(payload: Record<string, unknown>): void {
  const binDir = path.join(scratchDir, "bin");
  mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, "codex");
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
import fs from "node:fs";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("-o");
if (outputIndex < 0 || !args[outputIndex + 1]) {
  process.stderr.write("missing -o output path\\n");
  process.exit(1);
}
const outputPath = args[outputIndex + 1];
fs.readFileSync(0, "utf8");
fs.writeFileSync(outputPath, JSON.stringify(${JSON.stringify(payload)}) + "\\n", "utf8");
`,
    "utf8",
  );
  chmodSync(scriptPath, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${savedPath ?? ""}`;
}

function validEmptyLensSidecarPayload(): Record<string, unknown> {
  return {
    findings: [],
    domain_constraints_used: [],
    domain_context_assumptions: [],
    no_findings_rationale: "No finding.",
  };
}

describe("codex review unit executor", () => {
  it("rejects structured output when the Codex sandbox is writable", async () => {
    const packetPath = path.join(sessionRoot, "logic.prompt.md");
    const outputPath = path.join(sessionRoot, "round1", "logic.findings.yaml");
    writeFileSync(packetPath, "# Logic Lens\n", "utf8");

    await expect(
      runCodexReviewUnitExecutorCli([
        "--project-root",
        projectRoot,
        "--session-root",
        sessionRoot,
        "--unit-id",
        "logic",
        "--unit-kind",
        "lens",
        "--packet-path",
        packetPath,
        "--output-path",
        outputPath,
        "--output-format",
        "lens-sidecar",
        "--sandbox-mode",
        "workspace-write",
      ]),
    ).rejects.toThrow(/requires --sandbox-mode=read-only/);
  });

  it("rejects legacy payload_json wrappers before writing the sidecar artifact", async () => {
    installFakeCodex({
      payload_json: JSON.stringify(validEmptyLensSidecarPayload()),
    });
    const packetPath = path.join(sessionRoot, "logic.prompt.md");
    const outputPath = path.join(sessionRoot, "round1", "logic.findings.yaml");
    writeFileSync(packetPath, "# Logic Lens\n", "utf8");

    await expect(
      runCodexReviewUnitExecutorCli([
        "--project-root",
        projectRoot,
        "--session-root",
        sessionRoot,
        "--unit-id",
        "logic",
        "--unit-kind",
        "lens",
        "--packet-path",
        packetPath,
        "--output-path",
        outputPath,
        "--output-format",
        "lens-sidecar",
      ]),
    ).rejects.toThrow(/payload_json wrapper is no longer accepted/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects body wrappers before writing the sidecar artifact", async () => {
    installFakeCodex({
      body: validEmptyLensSidecarPayload(),
    });
    const packetPath = path.join(sessionRoot, "logic.prompt.md");
    const outputPath = path.join(sessionRoot, "round1", "logic.findings.yaml");
    writeFileSync(packetPath, "# Logic Lens\n", "utf8");

    await expect(
      runCodexReviewUnitExecutorCli([
        "--project-root",
        projectRoot,
        "--session-root",
        sessionRoot,
        "--unit-id",
        "logic",
        "--unit-kind",
        "lens",
        "--packet-path",
        packetPath,
        "--output-path",
        outputPath,
        "--output-format",
        "lens-sidecar",
      ]),
    ).rejects.toThrow(/submit_lens_findings has unsupported field body/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects runtime-owned fields before writing the sidecar artifact", async () => {
    installFakeCodex({
      ...validEmptyLensSidecarPayload(),
      schema_version: 1,
    });
    const packetPath = path.join(sessionRoot, "logic.prompt.md");
    const outputPath = path.join(sessionRoot, "round1", "logic.findings.yaml");
    writeFileSync(packetPath, "# Logic Lens\n", "utf8");

    await expect(
      runCodexReviewUnitExecutorCli([
        "--project-root",
        projectRoot,
        "--session-root",
        sessionRoot,
        "--unit-id",
        "logic",
        "--unit-kind",
        "lens",
        "--packet-path",
        packetPath,
        "--output-path",
        outputPath,
        "--output-format",
        "lens-sidecar",
      ]),
    ).rejects.toThrow(/submit_lens_findings has unsupported field schema_version/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("bridges lens-sidecar JSON payloads through submit_lens_findings", async () => {
    installFakeCodex({
      findings: [
        {
          target: "src/example.ts",
          evidence_anchor: "src/example.ts:12",
          claim: "Example branch hides a relevant review result.",
          what: "A low-severity surface issue is visible in the target.",
          why: "The evidence anchor shows the behavior and the review should preserve it.",
          how_to_fix: "Expose the branch in the reviewed contract.",
          upstream_evidence_required: false,
          severity_hint: "info",
          materiality_basis: null,
          causal_path: null,
        },
      ],
      domain_constraints_used: [
        {
          source_doc: ".onto/processes/review/lens-registry.md",
          source_version_or_snapshot_id: "test-fixture",
          anchor: "#lens",
        },
      ],
      domain_context_assumptions: ["No external domain profile was used."],
      no_findings_rationale: "",
    });
    const packetPath = path.join(sessionRoot, "logic.prompt.md");
    const outputPath = path.join(sessionRoot, "round1", "logic.findings.yaml");
    writeFileSync(
      packetPath,
      [
        "# Logic Lens",
        "",
        "Review the bounded target and submit findings.",
      ].join("\n"),
      "utf8",
    );

    await runCodexReviewUnitExecutorCli([
      "--project-root",
      projectRoot,
      "--session-root",
      sessionRoot,
      "--unit-id",
      "logic",
      "--unit-kind",
      "lens",
      "--packet-path",
      packetPath,
      "--output-path",
      outputPath,
      "--output-format",
      "lens-sidecar",
      "--human-output-ref",
      ".onto/review/20260607-test-session/round1/logic.md",
      "--reasoning-effort",
      "medium",
    ]);

    expect(existsSync(`${outputPath}.codex-output.json`)).toBe(false);
    expect(existsSync(`${outputPath}.codex-output.json.schema.json`)).toBe(false);
    const artifact = YAML.parse(readFileSync(outputPath, "utf8"));
    expect(artifact.schema_version).toBe(1);
    expect(artifact.session_id).toBe("20260607-test-session");
    expect(artifact.lens_id).toBe("logic");
    expect(artifact.human_output_ref).toBe(
      ".onto/review/20260607-test-session/round1/logic.md",
    );
    expect(artifact.findings).toHaveLength(1);
    expect(artifact.findings[0].candidate_id).toBe("logic-candidate-001");
    expect(artifact.findings[0].severity_hint).toBe("info");
    expect(artifact.validation.unaddressable_candidates).toEqual([]);
  });
});
