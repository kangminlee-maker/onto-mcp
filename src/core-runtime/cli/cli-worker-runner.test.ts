import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runCliWorkerUnit,
  type CliWorkerAdapter,
  type WorkerRunState,
} from "./cli-worker-runner.js";

// Fake binaries via `node -e <script>`, so the runner lifecycle is exercised
// deterministically without needing a real codex/claude install. Each script
// drains stdin first to avoid EPIPE when it does not otherwise read it.
const ECHO_STDIN = "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{process.stdout.write('OUT:'+d.trim());process.exit(0)})";
const FAIL_EXIT3 = "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{process.stderr.write('boom');process.exit(3)})";
const EXIT0_NO_OUTPUT = "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{process.exit(0)})";

function fakeAdapter(script: string, binary = process.execPath): CliWorkerAdapter {
  return {
    label: "fake",
    binary,
    notFoundMessage: "FAKE-NOT-FOUND",
    buildArgv: () => ["-e", script],
    extractOutput: async (_ctx, state: WorkerRunState) => state.stdout.trim(),
  };
}

let root = "";
function ctx(unitId = "lensA") {
  const outputPath = path.join(root, "round1", `${unitId}.md`);
  return {
    projectRoot: root,
    sessionRoot: root,
    unitId,
    unitKind: "lens",
    outputPath,
    boundedPrompt: "hello-prompt",
  };
}
function runningLog(unitId = "lensA") {
  return path.join(root, "round1", `.${unitId}.running.log`);
}
function nestedErr(unitId = "lensA") {
  return path.join(root, "round1", `.${unitId}.nested-stderr.log`);
}

describe("runCliWorkerUnit", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "onto-worker-runner-"));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes extracted output to outputPath and removes the running log on success", async () => {
    const c = ctx();
    await runCliWorkerUnit(fakeAdapter(ECHO_STDIN), c);
    expect(fs.readFileSync(c.outputPath, "utf8").trim()).toBe("OUT:hello-prompt");
    expect(fs.existsSync(runningLog())).toBe(false);
    expect(fs.existsSync(nestedErr())).toBe(false);
  });

  it("on non-zero exit: throws with stderr and PRESERVES the running log (renamed to nested-stderr)", async () => {
    await expect(runCliWorkerUnit(fakeAdapter(FAIL_EXIT3), ctx())).rejects.toThrow(/boom/);
    expect(fs.existsSync(runningLog())).toBe(false);
    expect(fs.existsSync(nestedErr())).toBe(true);
    expect(fs.readFileSync(nestedErr(), "utf8")).toMatch(/ENV-AFTER unit=lensA exit=3/);
  });

  it("on exit 0 with no usable output: throws AND preserves the running log (1.4c post-parse failure)", async () => {
    await expect(runCliWorkerUnit(fakeAdapter(EXIT0_NO_OUTPUT), ctx())).rejects.toThrow(/no usable output/);
    // The key regression guard: the trace is NOT deleted on the exit-0 path
    // before output is validated.
    expect(fs.existsSync(runningLog())).toBe(false);
    expect(fs.existsSync(nestedErr())).toBe(true);
    expect(fs.existsSync(ctx().outputPath)).toBe(false);
  });

  it("surfaces the adapter notFoundMessage when the binary is missing (ENOENT)", async () => {
    await expect(
      runCliWorkerUnit(fakeAdapter(ECHO_STDIN, "onto-nonexistent-binary-xyz"), ctx()),
    ).rejects.toThrow("FAKE-NOT-FOUND");
  });
});
