import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertPathInsideRoot } from "./path-boundary.js";

describe("assertPathInsideRoot", () => {
  it("accepts paths that differ lexically but resolve inside the same real root", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "onto-path-boundary-"));
    const realRoot = path.join(base, "real", "session");
    const aliasBase = path.join(base, "alias");
    await fs.mkdir(realRoot, { recursive: true });
    await fs.symlink(path.join(base, "real"), aliasBase);
    const artifact = path.join(aliasBase, "session", "final-output.md");
    await fs.writeFile(artifact, "ok\n", "utf8");

    await expect(
      assertPathInsideRoot({
        root: await fs.realpath(realRoot),
        candidate: artifact,
        label: "artifact",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a symlink that lexically sits under the root but resolves outside", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "onto-path-boundary-"));
    const root = path.join(base, "root");
    const outside = path.join(base, "outside");
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    const outsideFile = path.join(outside, "secret.txt");
    await fs.writeFile(outsideFile, "secret\n", "utf8");
    const symlink = path.join(root, "linked-secret.txt");
    await fs.symlink(outsideFile, symlink);

    await expect(
      assertPathInsideRoot({
        root,
        candidate: symlink,
        label: "artifact",
      }),
    ).rejects.toThrow(/realpath escapes allowed root/);
  });
});
