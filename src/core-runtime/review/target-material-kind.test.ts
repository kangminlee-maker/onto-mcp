import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  detectTargetMaterialKind,
  detectTargetMaterialRefs,
  reviewMaterialGoals,
  reviewMaterialSupportStatus,
} from "../target-material-kind.js";

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

  // PR-0 defect fix: the code-structure observer already maps .cjs/.mts/.cts to
  // javascript/typescript grammars, but CODE_EXTENSIONS omitted them — so such a file was
  // classified `unknown` and never reached observation (or review's code support path).
  // Contrast: before this fix each extension below yielded kind "unknown".
  it.each([".mts", ".cts", ".cjs"])(
    "classifies %s module files as code so they reach observation",
    async (ext) => {
      const root = await makeTmpProject();
      const target = path.join(root, `handler${ext}`);
      await fs.writeFile(target, "export const ok = true;\n", "utf8");

      const detection = await detectTargetMaterialKind([target]);

      expect(detection.target_material_kind).toBe("code");
      expect(detection.target_material_kind_candidates).toEqual(["code"]);
      // Shared classifier ⇒ review's kind-level support path also resolves to supported.
      expect(reviewMaterialSupportStatus(detection.target_material_kind)).toEqual({
        status: "supported",
        reason: null,
      });
    },
  );

  // Multi-language Tier 2 expansion (T1): the C/C++ observer parses .c/.h/.cpp/... via the cpp
  // grammar, so C/C++ headers and alternate source extensions must classify as code to reach it.
  it.each([".h", ".hpp", ".hh", ".cxx"])(
    "classifies C/C++ header/source extension %s as code",
    async (ext) => {
      const root = await makeTmpProject();
      const target = path.join(root, `widget${ext}`);
      await fs.writeFile(target, "int main() { return 0; }\n", "utf8");

      const detection = await detectTargetMaterialKind([target]);

      expect(detection.target_material_kind).toBe("code");
    },
  );

  // Tier 2 scripts (T3): Bash/PowerShell files must classify as code to reach the observer.
  it.each([".bash", ".ps1", ".psm1"])(
    "classifies script extension %s as code",
    async (ext) => {
      const root = await makeTmpProject();
      const target = path.join(root, `script${ext}`);
      await fs.writeFile(target, "echo hi\n", "utf8");

      const detection = await detectTargetMaterialKind([target]);

      expect(detection.target_material_kind).toBe("code");
    },
  );

  // Kotlin (T2): .kt already classified; .kts (Kotlin script) added so both reach the observer.
  it.each([".kt", ".kts"])("classifies Kotlin extension %s as code", async (ext) => {
    const root = await makeTmpProject();
    const target = path.join(root, `Main${ext}`);
    await fs.writeFile(target, "fun main() {}\n", "utf8");

    const detection = await detectTargetMaterialKind([target]);

    expect(detection.target_material_kind).toBe("code");
  });
});

describe("reviewMaterialSupportStatus (kind-level claim)", () => {
  it("reports code and spreadsheet as supported with no unsupported_reason", () => {
    // The per-target FORMAT gate (unsupported .xls etc.) lives in the materializer;
    // the kind-level claim for spreadsheet is supported with the structure-only honesty
    // carried by the render + contract (unsupported_reason stays null).
    expect(reviewMaterialSupportStatus("code")).toEqual({ status: "supported", reason: null });
    expect(reviewMaterialSupportStatus("spreadsheet")).toEqual({
      status: "supported",
      reason: null,
    });
  });

  it("keeps document and database partial until their per-material adapters land", () => {
    expect(reviewMaterialSupportStatus("document").status).toBe("partial");
    expect(reviewMaterialSupportStatus("database").status).toBe("partial");
  });

  it("maps mixed to partial_composite and unknown to unknown", () => {
    expect(reviewMaterialSupportStatus("mixed").status).toBe("partial_composite");
    expect(reviewMaterialSupportStatus("unknown").status).toBe("unknown");
  });
});

describe("reviewMaterialGoals (kind-derived review obligations)", () => {
  it("returns the spreadsheet structural-audit obligations", () => {
    expect(reviewMaterialGoals("spreadsheet")).toEqual([
      "formula_integrity",
      "cross_sheet_reference_integrity",
      "named_range_hygiene",
      "data_validation_coverage",
      "access_and_protection_hygiene",
      "structural_risk_signals",
    ]);
  });

  it("returns no material goals for kinds without a per-material review adapter", () => {
    for (const kind of ["code", "document", "database", "mixed", "unknown"] as const) {
      expect(reviewMaterialGoals(kind)).toEqual([]);
    }
  });
});

// Layout-observer opt-in (design 20260721 §3.3): the Linguist unknown-fallback + extensionless
// shebang rung promote tree-sitter-unsupported long-tail sources to `code` ONLY behind the
// layoutFallback option, so they reach observation. Off = classifier byte-identical.
describe("detectTargetMaterialRefs layout unknown-fallback", () => {
  async function kindOf(ref: string, opts?: { layoutFallback?: boolean }) {
    const [detection] = await detectTargetMaterialRefs([ref], opts);
    return detection?.kind;
  }

  it("promotes a grammar-free programming extension (.lua) to code only under the opt-in", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "config.lua");
    await fs.writeFile(target, "local M = {}\nfunction M.f() end\nreturn M\n", "utf8");

    // Contrast: off → unknown (skipped from observation), on → code (reaches observation).
    expect(await kindOf(target)).toBe("unknown");
    expect(await kindOf(target, { layoutFallback: true })).toBe("code");
  });

  it("promotes another programming long-tail (.hs) and a markup source (.vue) under the opt-in", async () => {
    const root = await makeTmpProject();
    const hs = path.join(root, "Main.hs");
    const vue = path.join(root, "App.vue");
    await fs.writeFile(hs, "module Main where\nmain = putStrLn \"hi\"\n", "utf8");
    await fs.writeFile(vue, "<template><div/></template>\n", "utf8");

    expect(await kindOf(hs, { layoutFallback: true })).toBe("code");
    expect(await kindOf(vue, { layoutFallback: true })).toBe("code");
  });

  it("keeps data-only (.rbs) and truly-unknown (.zzz) extensions unknown even under the opt-in", async () => {
    const root = await makeTmpProject();
    const rbs = path.join(root, "sig.rbs");
    const zzz = path.join(root, "opaque.zzz");
    await fs.writeFile(rbs, "class Foo\nend\n", "utf8");
    await fs.writeFile(zzz, "whatever\n", "utf8");

    // Data-only Linguist candidates (.rbs) and no-candidate extensions (.zzz) are NOT promoted:
    // the fallback requires a programming/markup candidate, so serialization/prose data stays out.
    expect(await kindOf(rbs, { layoutFallback: true })).toBe("unknown");
    expect(await kindOf(zzz, { layoutFallback: true })).toBe("unknown");
  });

  it("classifies an extensionless shebang source as code via the 128B rung, only under the opt-in", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "run-thing");
    await fs.writeFile(target, "#!/usr/bin/env lua\nprint('hi')\n", "utf8");

    // Contrast: the shebang rung is gated on the opt-in and only fires for extensionless refs.
    expect(await kindOf(target)).toBe("unknown");
    expect(await kindOf(target, { layoutFallback: true })).toBe("code");
  });

  it("keeps an extensionless non-shebang file unknown even under the opt-in", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "notes");
    await fs.writeFile(target, "just some plain text, no shebang\n", "utf8");

    expect(await kindOf(target, { layoutFallback: true })).toBe("unknown");
  });

  it("does not regress the existing hand-table classification (.ts/.md/.csv) with the opt-in on", async () => {
    const root = await makeTmpProject();
    const ts = path.join(root, "h.ts");
    const md = path.join(root, "readme.md");
    const csv = path.join(root, "data.csv");
    await fs.writeFile(ts, "export const x = 1;\n", "utf8");
    await fs.writeFile(md, "# doc\n", "utf8");
    await fs.writeFile(csv, "a,b\n1,2\n", "utf8");

    expect(await kindOf(ts, { layoutFallback: true })).toBe("code");
    expect(await kindOf(md, { layoutFallback: true })).toBe("document");
    expect(await kindOf(csv, { layoutFallback: true })).toBe("spreadsheet");
  });
});
