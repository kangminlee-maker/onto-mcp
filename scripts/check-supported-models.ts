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
import {
  isSynthesizeCertCandidate,
  parseSynthesizeCertRecord,
  synthesizeCertBindingViolations,
  validateSynthesizeCertRecord,
} from "../src/core-runtime/discovery/synthesize-cert-record.js";
import {
  isReviewCertCandidate,
  parseReviewCertRecord,
  reviewCertBindingViolations,
  validateReviewCertRecord,
} from "../src/core-runtime/discovery/review-cert-record.js";
import {
  assertBenchCandidateTokenPolicy,
} from "./check-supported-models-token-policy.js";

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

/** The ONLY entries allowed to omit `roles` (grandfathered full-route
 * allowance predating the role dimension — supported-models.ts documents the
 * semantics). Frozen as a literal allowlist (laxness-lens F4, matching this
 * repo's literal-allowlist precedent): without the freeze, a FUTURE entry
 * could omit `roles` and both skip the synthesize-cert binding below AND be
 * dispatchable at the synthesize seat via the grandfather semantics. */
const GRANDFATHERED_ROLELESS_ENTRIES = new Set([
  "openai/gpt-5.5",
  "anthropic/claude-opus-4-8",
]);

function assertRolesDeclaredOutsideGrandfather(
  registry: Awaited<ReturnType<typeof loadSupportedModelRegistry>>,
): void {
  const bad = registry.supported_models
    .filter((entry) =>
      entry.roles === undefined &&
      !GRANDFATHERED_ROLELESS_ENTRIES.has(`${entry.provider}/${entry.model}`)
    )
    .map((entry) => `${entry.provider}/${entry.model}`);
  if (bad.length > 0) {
    throw new Error(
      "entries outside the grandfathered set must declare roles (an absent " +
        "roles key is a full-route allowance and would skip the role evidence " +
        "contracts):\n" + bad.map((m) => `  - ${m}`).join("\n"),
    );
  }
}

/** B5 role↔record binding (design §11 · onto 20260705-7e0e5263 issue-001/003/006):
 * an entry listing the `semantic_map_synthesize` role must cite a
 * `synthesize-cert/v1` record that PARSES and RECOMPUTES to zero violations for
 * this entry's (provider, model). The recompute itself lives in the shared
 * core-runtime module (no G7-local parser — design §6.3); this function only
 * does the repo I/O of reading the cited evidence files. */
async function assertSynthesizeCertBinding(
  registry: Awaited<ReturnType<typeof loadSupportedModelRegistry>>,
): Promise<void> {
  // Baseline-anchoring authority (owner decision ②): the set of certified
  // supported models a cert record's baseline arm may claim to have run.
  const supportedModelKeys = new Set(
    registry.supported_models.map((e) => `${e.provider}/${e.model}`),
  );
  const bad: string[] = [];
  for (const entry of registry.supported_models) {
    if (!entry.roles?.includes("semantic_map_synthesize")) continue;
    const evidenceByRef = new Map<string, unknown>();
    for (const ref of entry.benchmark_evidence_refs) {
      try {
        evidenceByRef.set(
          ref,
          JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, ref), "utf8")),
        );
      } catch {
        // Unreadable/non-JSON refs simply cannot serve as the cert record; the
        // tracked-file check below already polices their existence separately.
      }
    }
    const violations = synthesizeCertBindingViolations({
      entry,
      evidenceByRef,
      supportedModelKeys,
    });
    for (const item of violations) {
      bad.push(
        `${entry.provider}/${entry.model}: [${item.code}] ${item.message}`,
      );
    }
    if (violations.length === 0) {
      // Non-blocking honesty surfacing (laxness-lens S2): binding is an
      // existential ("1개 이상" — design §13), so a co-cited FAILING cert
      // record is tolerated; contradictory evidence should still be visible.
      for (const [ref, raw] of evidenceByRef) {
        if (!isSynthesizeCertCandidate(raw)) continue;
        const { record } = parseSynthesizeCertRecord(raw);
        const failing = record === null ||
          validateSynthesizeCertRecord(record).length > 0;
        if (failing) {
          console.warn(
            `[check:supported-models] WARN: ${entry.provider}/${entry.model} cites a FAILING synthesize-cert record at ${ref} alongside its binding record`,
          );
        }
      }
    }
  }
  if (bad.length > 0) {
    throw new Error(
      "semantic_map_synthesize entries are not bound to a passing synthesize-cert/v1 record:\n" +
        bad.map((m) => `  - ${m}`).join("\n"),
    );
  }
}

/** review-role binding (review-role registration design §4): an entry listing
 * the `review` role must cite a `review-cert/v1` record that PARSES and
 * RECOMPUTES to zero violations for this entry's (provider, model). Same
 * shape as {@link assertSynthesizeCertBinding}: the recompute lives in the
 * shared core-runtime module, this function only does the repo I/O; binding is
 * existential, and a co-cited FAILING record is surfaced as a WARN. */
async function assertReviewCertBinding(
  registry: Awaited<ReturnType<typeof loadSupportedModelRegistry>>,
): Promise<void> {
  const supportedModelKeys = new Set(
    registry.supported_models.map((e) => `${e.provider}/${e.model}`),
  );
  const bad: string[] = [];
  for (const entry of registry.supported_models) {
    if (!entry.roles?.includes("review")) continue;
    const evidenceByRef = new Map<string, unknown>();
    for (const ref of entry.benchmark_evidence_refs) {
      try {
        evidenceByRef.set(
          ref,
          JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, ref), "utf8")),
        );
      } catch {
        // Unreadable/non-JSON refs simply cannot serve as the cert record; the
        // tracked-file check already polices their existence separately.
      }
    }
    const violations = reviewCertBindingViolations({
      entry,
      evidenceByRef,
      supportedModelKeys,
    });
    for (const item of violations) {
      bad.push(
        `${entry.provider}/${entry.model}: [${item.code}] ${item.message}`,
      );
    }
    if (violations.length === 0) {
      for (const [ref, raw] of evidenceByRef) {
        if (!isReviewCertCandidate(raw)) continue;
        const { record } = parseReviewCertRecord(raw);
        const failing = record === null ||
          validateReviewCertRecord(record).length > 0;
        if (failing) {
          console.warn(
            `[check:supported-models] WARN: ${entry.provider}/${entry.model} cites a FAILING review-cert record at ${ref} alongside its binding record`,
          );
        }
      }
    }
  }
  if (bad.length > 0) {
    throw new Error(
      "review entries are not bound to a passing review-cert/v1 record:\n" +
        bad.map((m) => `  - ${m}`).join("\n"),
    );
  }
}

async function main(): Promise<void> {
  const registry = loadSupportedModelRegistry();
  try {
    await assertEvidenceRefsTracked(registry);
    assertRolesDeclaredOutsideGrandfather(registry);
    await assertSynthesizeCertBinding(registry);
    await assertReviewCertBinding(registry);
    await assertBenchCandidateTokenPolicy(PROJECT_ROOT);
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
