/**
 * G7 — supported-model guard (INV-MODEL-1).
 *
 * The committed .onto/settings.json may only select models verified as supported
 * by benchmark, i.e. listed in the authority registry
 * `.onto/authority/supported-models.yaml`. Validation is on the runtime-effective
 * (provider, model) routes (after settings inheritance). This guard calls the
 * very same gate the runtime uses at the reconstruct live execution boundary
 * (assertSettingsModelsSupported), so it cannot disagree with the runtime; it
 * pins the gate to the repo's committed config (every seat) in CI — which is
 * also how committed review seats are covered while review-side runtime
 * enforcement remains a noted follow-up. Settings are parsed with the YAML
 * parser the runtime uses (comment-tolerant). Settings resolution itself is a
 * pure projection and does not apply this gate.
 *
 * This guard also enforces the registry's evidence contract: every supported
 * entry must cite at least one benchmark_evidence_refs path that is a GIT-TRACKED
 * REGULAR FILE — the complete, bounded definition of auditable in-repo evidence.
 * Tracked ⇒ committed/auditable (subsumes existence and the repo-relative,
 * in-root shape); rejecting mode 120000 ⇒ a symlink cannot smuggle an
 * out-of-tree file in as evidence. The path SHAPE is additionally validated at
 * registry load (assertRepoRelativeEvidenceRefs, runtime-safe); the tracked-file
 * check runs in repo context, since installed packages need not ship the
 * benchmark records.
 *
 * npm: `check:supported-models`.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";

const execFileAsync = promisify(execFile);
import {
  assertSettingsModelsSupported,
  collectEffectiveModelRoutes,
  type OntoSettings,
} from "../src/core-runtime/discovery/settings-chain.js";
import {
  exactTrackedMode,
  loadSupportedModelRegistry,
} from "../src/core-runtime/discovery/supported-models.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Git index mode for a regular file (vs 120000 symlink, 160000 gitlink). */
const GIT_REGULAR_FILE_MODES = new Set(["100644", "100755"]);

/** Returns the git index mode of `ref` if it is git-tracked under that EXACT
 * path, or null otherwise. `-z` keeps paths literal; GIT_LITERAL_PATHSPECS
 * disables glob/`:(magic)` so `ref` is taken verbatim; exactTrackedMode then
 * requires the listed path to equal `ref` so a directory or imprecise pathspec
 * (which lists child/other tracked files) does not resolve to a stray mode. */
async function trackedFileMode(ref: string): Promise<string | null> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-s", "-z", "--", ref],
    { cwd: PROJECT_ROOT, env: { ...process.env, GIT_LITERAL_PATHSPECS: "1" } },
  );
  return exactTrackedMode(stdout, ref);
}

async function assertEvidenceRefsTracked(
  registry: Awaited<ReturnType<typeof loadSupportedModelRegistry>>,
): Promise<void> {
  const bad: string[] = [];
  for (const entry of registry.supported_models) {
    let anyTracked = false;
    for (const ref of entry.benchmark_evidence_refs) {
      const label = `${entry.provider}/${entry.model}: ${ref}`;
      let mode: string | null;
      try {
        mode = await trackedFileMode(ref);
      } catch (error) {
        bad.push(
          `${label} (git ls-files failed: ${
            error instanceof Error ? error.message : String(error)
          })`,
        );
        continue;
      }
      if (mode === null) {
        bad.push(`${label} (not git-tracked)`);
        continue;
      }
      if (!GIT_REGULAR_FILE_MODES.has(mode)) {
        // 120000 symlink / 160000 gitlink — not auditable in-repo evidence.
        bad.push(`${label} (not a regular file: git mode ${mode})`);
        continue;
      }
      anyTracked = true;
    }
    if (!anyTracked) {
      bad.push(
        `${entry.provider}/${entry.model}: no benchmark_evidence_refs is a git-tracked regular file`,
      );
    }
  }
  if (bad.length > 0) {
    throw new Error(
      "registry entries cite benchmark_evidence_refs that are not git-tracked regular files:\n" +
        bad.map((m) => `  - ${m}`).join("\n"),
    );
  }
}

async function main(): Promise<void> {
  const registry = loadSupportedModelRegistry();
  try {
    await assertEvidenceRefsTracked(registry);
  } catch (error) {
    console.error("[check:supported-models] FAIL");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const settingsPath = path.join(PROJECT_ROOT, ".onto", "settings.json");
  let settings: OntoSettings;
  try {
    settings = parseYaml(await fs.readFile(settingsPath, "utf8")) as OntoSettings;
  } catch (error) {
    console.error(
      `[check:supported-models] FAIL: cannot read/parse .onto/settings.json: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
  try {
    assertSettingsModelsSupported(settings);
  } catch (error) {
    console.error("[check:supported-models] FAIL");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        check: "supported-models",
        status: "passed",
        authority: ".onto/authority/supported-models.yaml",
        verified_models: registry.supported_models.map((entry) =>
          `${entry.provider}/${entry.model}`
        ),
        validated_routes: collectEffectiveModelRoutes(settings).length,
      },
      null,
      2,
    ),
  );
}

await main();
