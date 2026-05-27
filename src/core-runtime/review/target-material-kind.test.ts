import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectTargetMaterialKind } from "../target-material-kind.js";

const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-target-material-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("detectTargetMaterialKind", () => {
  it("classifies spreadsheets before generic data artifacts", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "schedule.csv");
    await fs.writeFile(target, "account,amount\ncash,10\n", "utf8");

    const detection = await detectTargetMaterialKind([target]);

    expect(detection.target_material_kind).toBe("spreadsheet");
    expect(detection.target_material_kind_candidates).toEqual(["spreadsheet"]);
    expect(detection.confidence).toBeGreaterThan(0.8);
  });

  it("classifies a multi-material bundle as mixed", async () => {
    const root = await makeTmpProject();
    const code = path.join(root, "handler.ts");
    const doc = path.join(root, "policy.md");
    await fs.writeFile(code, "export const ok = true;\n", "utf8");
    await fs.writeFile(doc, "# Policy\n", "utf8");

    const detection = await detectTargetMaterialKind([code, doc]);

    expect(detection.target_material_kind).toBe("mixed");
    expect(detection.target_material_kind_candidates.sort()).toEqual([
      "code",
      "document",
    ]);
  });

  it("keeps unknown when no material evidence is available", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "target.opaque");

    const detection = await detectTargetMaterialKind([target]);

    expect(detection.target_material_kind).toBe("unknown");
    expect(detection.target_material_kind_candidates).toEqual(["unknown"]);
  });
});
