import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createReviewUnitToolExecutionContext,
  findToolByName,
  getToolBoundarySkipSummary,
  type ToolExecutionContext,
} from "./onto-tools.js";

let scratchDir: string;
let projectRoot: string;
let ontoHome: string;

beforeEach(() => {
  scratchDir = mkdtempSync(path.join(tmpdir(), "onto-tools-test-"));
  projectRoot = path.join(scratchDir, "project");
  ontoHome = path.join(scratchDir, ".onto");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(ontoHome, { recursive: true });
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

function ctx(allowedReadRefs?: string[]): ToolExecutionContext {
  return {
    projectRoot,
    ontoHome,
    ...(allowedReadRefs ? { allowedReadRefs } : {}),
  };
}

describe("ONTO_DEFAULT_TOOLS allowedReadRefs boundary", () => {
  it("rejects review-unit tool context without allowed_read_refs", () => {
    expect(() =>
      createReviewUnitToolExecutionContext({
        projectRoot,
        ontoHome,
        allowedReadRefs: [],
      }),
    ).toThrow(/allowed_read_refs/);
  });

  it("freezes and copies review-unit tool context authority", async () => {
    const targetPath = path.join(projectRoot, "allowed.md");
    const siblingPath = path.join(projectRoot, "sibling.md");
    writeFileSync(targetPath, "allowed\n", "utf8");
    writeFileSync(siblingPath, "sibling\n", "utf8");
    const refs = [targetPath];
    const reviewCtx = createReviewUnitToolExecutionContext({
      projectRoot,
      ontoHome,
      allowedReadRefs: refs,
    });
    refs[0] = siblingPath;

    expect(Object.isFrozen(reviewCtx)).toBe(true);
    expect(Object.isFrozen(reviewCtx.allowedReadRefs)).toBe(true);

    const readFile = findToolByName("read_file");
    const result = await readFile!.execute({ path: targetPath }, reviewCtx);
    expect(result).toContain("allowed");
    await expect(
      readFile!.execute({ path: siblingPath }, reviewCtx),
    ).rejects.toThrow(/allowed_read_refs/);
  });

  it("recomputes real boundary after context authority mutation", async () => {
    const targetPath = path.join(projectRoot, "allowed.md");
    const siblingPath = path.join(projectRoot, "sibling.md");
    writeFileSync(targetPath, "allowed\n", "utf8");
    writeFileSync(siblingPath, "sibling\n", "utf8");
    const mutableCtx = ctx([targetPath]);

    const readFile = findToolByName("read_file");
    const result = await readFile!.execute({ path: targetPath }, mutableCtx);
    expect(result).toContain("allowed");

    mutableCtx.allowedReadRefs = [siblingPath];
    await expect(
      readFile!.execute({ path: targetPath }, mutableCtx),
    ).rejects.toThrow(/allowed_read_refs/);
  });

  it("allows read_file for an explicitly allowed file", async () => {
    const targetPath = path.join(projectRoot, "allowed.md");
    writeFileSync(targetPath, "hello\n", "utf8");

    const readFile = findToolByName("read_file");
    expect(readFile).toBeDefined();
    const result = await readFile!.execute(
      { path: targetPath },
      ctx([targetPath]),
    );

    expect(result).toContain("hello");
  });

  it("rejects read_file inside projectRoot but outside allowed_read_refs", async () => {
    const targetPath = path.join(projectRoot, "allowed.md");
    const siblingPath = path.join(projectRoot, "sibling.md");
    writeFileSync(targetPath, "allowed\n", "utf8");
    writeFileSync(siblingPath, "sibling\n", "utf8");

    const readFile = findToolByName("read_file");
    await expect(
      readFile!.execute({ path: siblingPath }, ctx([targetPath])),
    ).rejects.toThrow(/allowed_read_refs/);
  });

  it("allows search_content under an explicitly allowed directory", async () => {
    const allowedDir = path.join(projectRoot, "allowed");
    mkdirSync(allowedDir, { recursive: true });
    writeFileSync(path.join(allowedDir, "a.md"), "needle\n", "utf8");

    const searchContent = findToolByName("search_content");
    const result = await searchContent!.execute(
      { pattern: "needle", path: allowedDir },
      ctx([allowedDir]),
    );

    expect(result).toContain("needle");
  });

  it("rejects list_directory for a parent directory when only a file is allowed", async () => {
    const targetPath = path.join(projectRoot, "allowed.md");
    writeFileSync(targetPath, "allowed\n", "utf8");

    const listDirectory = findToolByName("list_directory");
    await expect(
      listDirectory!.execute({ path: projectRoot }, ctx([targetPath])),
    ).rejects.toThrow(/allowed_read_refs/);
  });

  it("rejects read_file for a symlink that points outside the boundary", async () => {
    const externalDir = path.join(scratchDir, "external");
    mkdirSync(externalDir, { recursive: true });
    const externalFile = path.join(externalDir, "secret.md");
    const symlinkPath = path.join(projectRoot, "linked-secret.md");
    writeFileSync(externalFile, "SECRET\n", "utf8");
    symlinkSync(externalFile, symlinkPath);

    const readFile = findToolByName("read_file");
    await expect(
      readFile!.execute({ path: symlinkPath }, ctx([symlinkPath])),
    ).rejects.toThrow(/outside projectRoot|allowed_read_refs|boundary/);
  });

  it("rejects list_directory for a symlinked directory outside the boundary", async () => {
    const externalDir = path.join(scratchDir, "external");
    mkdirSync(externalDir, { recursive: true });
    writeFileSync(path.join(externalDir, "secret.md"), "SECRET\n", "utf8");
    const symlinkPath = path.join(projectRoot, "linked-dir");
    symlinkSync(externalDir, symlinkPath, "dir");

    const listDirectory = findToolByName("list_directory");
    await expect(
      listDirectory!.execute({ path: symlinkPath }, ctx([symlinkPath])),
    ).rejects.toThrow(/outside projectRoot|allowed_read_refs|boundary/);
  });

  it("does not traverse symlinked directories during search_content", async () => {
    const externalDir = path.join(scratchDir, "external");
    mkdirSync(externalDir, { recursive: true });
    writeFileSync(path.join(externalDir, "secret.md"), "SECRET\n", "utf8");
    const symlinkPath = path.join(projectRoot, "linked-dir");
    symlinkSync(externalDir, symlinkPath, "dir");

    const searchContent = findToolByName("search_content");
    const reviewCtx = createReviewUnitToolExecutionContext({
      projectRoot,
      ontoHome,
      allowedReadRefs: [projectRoot],
    });
    const result = await searchContent!.execute(
      { pattern: "SECRET", path: projectRoot },
      reviewCtx,
    );

    expect(result).toContain("no matches");
    expect(result).toContain("boundary_skips=1");
    expect(getToolBoundarySkipSummary(reviewCtx)).toEqual({
      boundary_skips: 1,
      unreadable_skips: 0,
      oversized_skips: 0,
    });
    expect(result).not.toContain("secret.md");
  });
});
