import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { assertArrayField, atomicWriteFile, atomicWriteYamlDocument } from "./artifact-io.js";

const tmpRoots: string[] = [];

async function makeTmpDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-artifact-io-"));
  tmpRoots.push(root);
  return root;
}

async function listDir(dir: string): Promise<string[]> {
  return (await fs.readdir(dir)).sort();
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("atomicWriteFile", () => {
  it("writes exact contents to the target path", async () => {
    const root = await makeTmpDir();
    const target = path.join(root, "artifact.txt");

    await atomicWriteFile(target, "hello\nworld\n");

    expect(await fs.readFile(target, "utf8")).toBe("hello\nworld\n");
  });

  it("leaves no .tmp residue after a successful write", async () => {
    const root = await makeTmpDir();
    const target = path.join(root, "artifact.txt");

    await atomicWriteFile(target, "payload");

    expect(await listDir(root)).toEqual(["artifact.txt"]);
  });

  it("creates missing nested parent directories", async () => {
    const root = await makeTmpDir();
    const target = path.join(root, "deep", "nested", "dir", "artifact.txt");

    await atomicWriteFile(target, "payload");

    expect(await fs.readFile(target, "utf8")).toBe("payload");
  });

  it("replaces existing content atomically on overwrite", async () => {
    const root = await makeTmpDir();
    const target = path.join(root, "artifact.txt");

    await atomicWriteFile(target, "v1");
    await atomicWriteFile(target, "v2-longer-content");

    expect(await fs.readFile(target, "utf8")).toBe("v2-longer-content");
    expect(await listDir(root)).toEqual(["artifact.txt"]);
  });

  it("preserves the prior file and cleans up the temp file when rename fails", async () => {
    const root = await makeTmpDir();
    const target = path.join(root, "artifact.txt");
    await atomicWriteFile(target, "original-complete");

    // Simulate a crash/failure at the commit step (the torn-write window).
    const renameSpy = vi
      .spyOn(fs, "rename")
      .mockRejectedValueOnce(new Error("simulated rename failure"));

    await expect(atomicWriteFile(target, "would-be-torn")).rejects.toThrow(
      "simulated rename failure",
    );
    expect(renameSpy).toHaveBeenCalledTimes(1);

    // Prior file is intact (never truncated) and no temp file leaked.
    expect(await fs.readFile(target, "utf8")).toBe("original-complete");
    expect(await listDir(root)).toEqual(["artifact.txt"]);
  });

  it("uses distinct temp paths for concurrent writes to different targets", async () => {
    const root = await makeTmpDir();
    const targets = Array.from({ length: 8 }, (_unused, index) =>
      path.join(root, `artifact-${index}.txt`),
    );

    await Promise.all(
      targets.map((target, index) => atomicWriteFile(target, `payload-${index}`)),
    );

    for (let index = 0; index < targets.length; index += 1) {
      expect(await fs.readFile(targets[index]!, "utf8")).toBe(`payload-${index}`);
    }
    expect(await listDir(root)).toEqual(
      targets.map((target) => path.basename(target)).sort(),
    );
  });
});

describe("atomicWriteYamlDocument", () => {
  it("writes bytes identical to a direct stringifyYaml write", async () => {
    const root = await makeTmpDir();
    const target = path.join(root, "doc.yaml");
    const value = { status: "valid", count: 3, items: ["a", "b"] };

    await atomicWriteYamlDocument(target, value);

    expect(await fs.readFile(target, "utf8")).toBe(stringifyYaml(value));
  });

  it("round-trips a structured value through the parser", async () => {
    const root = await makeTmpDir();
    const target = path.join(root, "doc.yaml");
    const value = { nested: { ok: true }, list: [1, 2, 3] };

    await atomicWriteYamlDocument(target, value);

    expect(parseYaml(await fs.readFile(target, "utf8"))).toEqual(value);
  });

  it("leaves no .tmp residue after writing a document", async () => {
    const root = await makeTmpDir();
    const target = path.join(root, "doc.yaml");

    await atomicWriteYamlDocument(target, { ok: true });

    expect(await listDir(root)).toEqual(["doc.yaml"]);
  });
});

describe("assertArrayField", () => {
  it("passes for an array (including empty)", () => {
    expect(() => assertArrayField([], "source-observations", "observations")).not.toThrow();
    expect(() => assertArrayField([1, 2], "source-observations", "observations")).not.toThrow();
  });

  it.each([
    ["null", null, "null"],
    ["undefined (missing field)", undefined, "undefined"],
    ["a number scalar", 3, "number"],
    ["a string scalar", "not-an-array", "string"],
    ["an object map", { a: 1 }, "object"],
  ])("throws a contextualized integrity error for %s", (_label, value, gotType) => {
    expect(() => assertArrayField(value, "source-observations", "observations")).toThrow(
      /artifact integrity: source-observations field 'observations' must be an array/,
    );
    // The message names the actual type so the failure is actionable.
    expect(() => assertArrayField(value, "source-observations", "observations")).toThrow(
      new RegExp(`got ${gotType}`),
    );
  });

  it("names the specific artifact and field in the message", () => {
    expect(() => assertArrayField(null, "contract-registry", "validator_records")).toThrow(
      "artifact integrity: contract-registry field 'validator_records' must be an array, got null",
    );
  });
});
