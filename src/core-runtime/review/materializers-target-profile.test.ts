import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { ReviewTargetProfileArtifact } from "./artifact-types.js";
import { materializeReviewExecutionPreparationArtifacts } from "./materializers.js";

const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-review-profile-"));
  tmpRoots.push(root);
  return root;
}

async function readProfile(sessionRoot: string): Promise<ReviewTargetProfileArtifact> {
  const profilePath = path.join(
    sessionRoot,
    "execution-preparation",
    "review-target-profile.yaml",
  );
  return parseYaml(await fs.readFile(profilePath, "utf8")) as ReviewTargetProfileArtifact;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("review target profile material kind", () => {
  it("requires an explicit session domain instead of defaulting to none", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-domain");
    const target = path.join(root, "target.md");
    await fs.writeFile(target, "# Target\n", "utf8");

    await expect(
      materializeReviewExecutionPreparationArtifacts({
        sessionRoot,
        scopeKind: "file",
        resolvedTargetRefs: [target],
        materializedKind: "single_text",
        requestedTarget: target,
        reviewIntentSummary: "review target",
        sessionDomain: "",
        filesystemAllowedRoots: [root],
      }),
    ).rejects.toThrow("requires explicit sessionDomain");
  });

  it("records spreadsheet material kind and detection evidence", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-a");
    const target = path.join(root, "revenue.csv");
    await fs.writeFile(target, "month,revenue\nJan,100\n", "utf8");

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "file",
      resolvedTargetRefs: [target],
      materializedKind: "single_text",
      requestedTarget: target,
      reviewIntentSummary: "review accounting sheet",
      sessionDomain: "accounting",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    expect(profile.target_material_kind).toBe("spreadsheet");
    expect(profile.material_profile.target_material_kind).toBe("spreadsheet");
    expect(profile.material_profile.target_material_kind_candidates).toEqual([
      "spreadsheet",
    ]);
    expect(profile.material_profile.support_status).toBe("partial");
    expect(profile.material_profile.detection.confidence).toBeGreaterThan(0.8);
  });

  it("records mixed material kind for explicit bundles", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-b");
    const code = path.join(root, "src", "handler.ts");
    const doc = path.join(root, "docs", "policy.md");
    await fs.mkdir(path.dirname(code), { recursive: true });
    await fs.mkdir(path.dirname(doc), { recursive: true });
    await fs.writeFile(code, "export const ok = true;\n", "utf8");
    await fs.writeFile(doc, "# Policy\n", "utf8");

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "bundle",
      resolvedTargetRefs: [code, doc],
      materializedKind: "bundle_member_texts",
      requestedTarget: "implementation bundle",
      reviewIntentSummary: "review code and policy together",
      sessionDomain: "none",
      bundleKind: "mixed-evidence",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    expect(profile.target_material_kind).toBe("mixed");
    expect(profile.material_profile.target_material_kind_candidates.sort()).toEqual([
      "code",
      "document",
    ]);
    expect(profile.material_profile.support_status).toBe("partial_composite");
  });
});
