import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import type { ReviewExecutionResultArtifact } from "./artifact-types.js";
import { requireTerminalExecutionResult } from "./artifact-types.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const CORPUS_ROOT = path.join(REPO_ROOT, "development-records");

/**
 * Every `execution-result.yaml` a real past run wrote and the repo kept.
 *
 * The terminal gate and the nullable completion fields are an artifact-contract
 * change, and a contract change is only safe against the shapes it will actually
 * meet. Example fixtures are written by whoever wrote the code, so they agree
 * with it by construction; these do not. Sessions here span months of runtime
 * versions and every status the vocabulary has.
 */
function corpusFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) corpusFiles(full, found);
    else if (entry.name.endsWith("execution-result.yaml")) found.push(full);
  }
  return found;
}

const FILES = fs.existsSync(CORPUS_ROOT) ? corpusFiles(CORPUS_ROOT) : [];

describe("terminal gate against the kept execution-result corpus", () => {
  it("has a corpus to judge (an empty one would pass every claim below)", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("admits every artifact a past run left in a terminal state", () => {
    const terminal = FILES.map((file) => ({
      file,
      artifact: YAML.parse(
        fs.readFileSync(file, "utf8"),
      ) as ReviewExecutionResultArtifact,
    })).filter(({ artifact }) => artifact.execution_status !== "running");
    expect(terminal.length).toBeGreaterThan(50);

    const refused = terminal.filter(({ file, artifact }) => {
      try {
        requireTerminalExecutionResult(artifact, file);
        return false;
      } catch {
        return true;
      }
    });
    // A tightened gate that rejects real historical artifacts is a silent
    // backward-compatibility break: every archived session becomes unreadable.
    expect(refused.map(({ file }) => path.relative(REPO_ROOT, file))).toEqual([]);
  });

  it("refuses every artifact a past run left mid-flight", () => {
    const running = FILES.map((file) => ({
      file,
      artifact: YAML.parse(
        fs.readFileSync(file, "utf8"),
      ) as ReviewExecutionResultArtifact,
    })).filter(({ artifact }) => artifact.execution_status === "running");
    // Contrast control: without a `running` artifact in the corpus the claim
    // above cannot distinguish a working gate from one that admits everything.
    expect(running.length).toBeGreaterThan(0);

    for (const { file, artifact } of running) {
      expect(() => requireTerminalExecutionResult(artifact, file)).toThrow(
        /execution_status=running/,
      );
    }
  });

  it("keeps executed_lens_count equal to the completed lens results", () => {
    // The derivation this change introduced for mid-run merges. It is only a
    // safe derivation if it already held for what the terminal writers produced;
    // the corpus is the evidence that it does.
    const mismatched: string[] = [];
    let comparable = 0;
    for (const file of FILES) {
      const artifact = YAML.parse(
        fs.readFileSync(file, "utf8"),
      ) as ReviewExecutionResultArtifact;
      if (typeof artifact.executed_lens_count !== "number") continue;
      if (!Array.isArray(artifact.lens_execution_results)) continue;
      comparable += 1;
      const completed = artifact.lens_execution_results.filter(
        (result) => result?.status === "completed",
      ).length;
      if (artifact.executed_lens_count !== completed) {
        mismatched.push(
          `${path.relative(REPO_ROOT, file)}: declared=${artifact.executed_lens_count} completed=${completed}`,
        );
      }
    }
    expect(comparable).toBeGreaterThan(50);
    expect(mismatched).toEqual([]);
  });
});
