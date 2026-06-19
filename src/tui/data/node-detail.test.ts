import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readOutputTail } from "./node-detail.js";

const tmpFiles: string[] = [];

async function writeTmp(name: string, content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onto-tail-"));
  const file = path.join(dir, name);
  await fs.writeFile(file, content, "utf8");
  tmpFiles.push(file);
  return file;
}

afterAll(async () => {
  for (const file of tmpFiles) {
    await fs.rm(path.dirname(file), { recursive: true, force: true });
  }
});

describe("readOutputTail", () => {
  it("returns [] for an absent or unreadable path", async () => {
    expect(await readOutputTail(null)).toEqual([]);
    expect(await readOutputTail(undefined)).toEqual([]);
    expect(await readOutputTail("/no/such/file.log")).toEqual([]);
  });

  it("returns the last maxLines of a small file", async () => {
    const file = await writeTmp("small.log", "a\nb\nc\nd\ne\n");
    expect(await readOutputTail(file, 3)).toEqual(["c", "d", "e"]);
  });

  it("reads only a bounded suffix of a large file and drops the partial leading line", async () => {
    // ~100KB (> the 64KB cap), so the read starts mid-file. The last lines must
    // still be exact, and the first returned line must be a COMPLETE line (the
    // partial line at the cap boundary is dropped, never a truncated fragment).
    const lines = Array.from({ length: 5000 }, (_, i) => `line-${i}-${"x".repeat(15)}`);
    const file = await writeTmp("big.log", lines.join("\n") + "\n");
    const tail = await readOutputTail(file, 12);
    expect(tail).toHaveLength(12);
    expect(tail).toEqual(lines.slice(-12));
    // every returned line is a whole authored line, not a mid-line fragment
    for (const line of tail) expect(line.startsWith("line-")).toBe(true);
  });
});
