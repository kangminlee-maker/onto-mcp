/**
 * start-review-session — focused E2E test suite.
 *
 * Run: `npx vitest run src/core-runtime/cli/e2e-start-review-session.test.ts`
 *
 * Scope:
 *   Direct tests for resolveReviewSessionExtractMode — the helper that
 *   picks an extract mode from (env var > settings.json > default). The
 *   helper is exercised in isolation so the rest of startReviewSession
 *   (prepare + materialize + metadata I/O) does not need fixture setup.
 *
 * Isolation strategy:
 *   Each test builds a fake `ontoHome` tmpdir containing just enough to
 *   satisfy resolveOntoHome's validity check (package.json + roles/ or
 *   .onto/roles/ + .onto/authority/), then a separate `projectRoot` tmpdir with
 *   the config file under test. The `--onto-home` argv flag forces the
 *   resolver to use the fake ontoHome instead of walking up from the
 *   test's script directory (which would find the real repo and pick up
 *   the repo's live settings.json).
 *
 * Dual-layout coverage (Phase 3+):
 *   The main test block runs under `describe.each(["legacy", "phase3"])`.
 *   Each case rebuilds the fake ontoHome with the chosen roles layout —
 *   "legacy" writes top-level `roles/` (pre-Phase-3 shape), "phase3"
 *   writes `.onto/roles/` (Phase-3 canonical). This exercises isOntoRoot's
 *   dual-marker acceptance on both sides, not just the legacy fallback
 *   that Phase 7 will eventually remove.
 *
 * Format history:
 *   Converted from a tsx-run custom minimal test runner to vitest in
 *   2026-04-18 (handoff §2 Priority 2 Phase B). See commit message for
 *   diagnosis of the PR #96 / PR #113 regression fixed alongside this
 *   conversion (resolveOrthogonalConfigChain). Parameterized across
 *   dual-path role layouts in 2026-04-21 (PR #170 Codex F-4 resolve).
 */

import { describe, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveReviewSessionExtractMode } from "./start-review-session.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message} — expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `onto-e2e-srs-${prefix}-`));
}

/**
 * Possible roles-directory layouts that `isOntoRoot` accepts.
 * Phase 7 (2026-04-21) dropped the pre-Phase-3 top-level `roles/` fallback
 * — only the canonical `.onto/roles/` layout remains.
 */
export type RolesLayout = "phase3";

/**
 * Possible authority-directory layouts that `isOntoRoot` accepts.
 * Phase 7 (2026-04-21) dropped the pre-Phase-6 top-level `authority/`
 * fallback — only the canonical `.onto/authority/` layout remains.
 */
export type AuthorityLayout = "phase6";

export interface MakeFakeOntoHomeOptions {
  /** Which roles-directory layout to create. Default: "phase3". */
  layout?: RolesLayout;
  /** Which authority-directory layout to create. Default: "phase6". */
  authorityLayout?: AuthorityLayout;
  /** When set, writes `.onto/settings.json` with `learning_extract_mode: <value>`. */
  homeConfigExtractMode?: string;
}

/**
 * Build a tmpdir that passes `isOntoRoot` validation: needs
 * package.json with name "onto-core" AND (roles/ or .onto/roles/) AND
 * .onto/authority/. The `layout` option selects which roles path is created
 * so both branches of the dual-path fallback are exercised.
 */
function makeFakeOntoHome(
  prefix: string,
  opts: MakeFakeOntoHomeOptions = {},
): string {
  const { homeConfigExtractMode } = opts;
  const dir = makeTmpDir(prefix);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "onto-core", version: "0.0.0-test" }),
    "utf8",
  );
  fs.mkdirSync(path.join(dir, ".onto", "roles"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".onto", "authority"), { recursive: true });
  if (homeConfigExtractMode !== undefined) {
    fs.mkdirSync(path.join(dir, ".onto"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".onto", "settings.json"),
      `learning_extract_mode: ${homeConfigExtractMode}\n`,
      "utf8",
    );
  }
  return dir;
}

/**
 * Build a projectRoot tmpdir. When `configExtractMode` is provided,
 * writes .onto/settings.json with that value. When `configExtractMode`
 * is the sentinel `"<MISSING_FIELD>"`, writes a config with other
 * fields but NO `learning_extract_mode` key. When `configExtractMode`
 * is undefined, writes NO settings.json at all.
 */
function makeProjectRoot(
  prefix: string,
  configExtractMode?: string,
): string {
  const dir = makeTmpDir(prefix);
  if (configExtractMode === "<MISSING_FIELD>") {
    fs.mkdirSync(path.join(dir, ".onto"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".onto", "settings.json"),
      "output_language: en\n", // some other field, no learning_extract_mode
      "utf8",
    );
  } else if (configExtractMode !== undefined) {
    fs.mkdirSync(path.join(dir, ".onto"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".onto", "settings.json"),
      `learning_extract_mode: ${configExtractMode}\n`,
      "utf8",
    );
  }
  return dir;
}

/**
 * Save and restore the ONTO_LEARNING_EXTRACT_MODE env var so tests
 * don't pollute each other or the host process.
 */
function withEnvExtractMode<T>(
  value: string | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const prev = process.env.ONTO_LEARNING_EXTRACT_MODE;
  if (value === undefined) delete process.env.ONTO_LEARNING_EXTRACT_MODE;
  else process.env.ONTO_LEARNING_EXTRACT_MODE = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env.ONTO_LEARNING_EXTRACT_MODE;
      else process.env.ONTO_LEARNING_EXTRACT_MODE = prev;
    });
}

// ---------------------------------------------------------------------------
// Parameterized tests — each case runs under both roles layouts.
// ---------------------------------------------------------------------------

describe.each<RolesLayout>(["phase3"])(
  "start-review-session E2E (layout=%s)",
  (layout) => {
    // E-SRS-1 — env var set → env var wins even if config has a different value.
    //           Primary proof that ONTO_LEARNING_EXTRACT_MODE has highest
    //           precedence.
    it("E-SRS-1 env var wins over project config", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-1-home", { layout });
      const projectRoot = makeProjectRoot("e-srs-1-proj", "active");
      const argv = ["--onto-home", ontoHome];
      await withEnvExtractMode("shadow", async () => {
        const mode = await resolveReviewSessionExtractMode(argv, projectRoot);
        assertEqual(mode, "shadow", "env shadow beats config active");
      });
    });

    // E-SRS-2 — env var unset, project config has learning_extract_mode: shadow
    //           → resolver picks the config value.
    it("E-SRS-2 project config value used when env var is unset", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-2-home", { layout });
      const projectRoot = makeProjectRoot("e-srs-2-proj", "shadow");
      const argv = ["--onto-home", ontoHome];
      await withEnvExtractMode(undefined, async () => {
        const mode = await resolveReviewSessionExtractMode(argv, projectRoot);
        assertEqual(mode, "shadow", "config shadow used");
      });
    });

    // E-SRS-3 — env var set to the empty string → treated the same as unset.
    //           The check `envExtractMode.length === 0` is what makes an
    //           empty env var fall through to config.
    it("E-SRS-3 empty env var falls through to project config", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-3-home", { layout });
      const projectRoot = makeProjectRoot("e-srs-3-proj", "active");
      const argv = ["--onto-home", ontoHome];
      await withEnvExtractMode("", async () => {
        const mode = await resolveReviewSessionExtractMode(argv, projectRoot);
        assertEqual(mode, "active", "empty env var yields to config active");
      });
    });

    // E-SRS-4 — env var unset + project config has NO learning_extract_mode
    //           field → falls through to validateExtractMode's default "disabled".
    it("E-SRS-4 missing config field defaults to disabled", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-4-home", { layout });
      const projectRoot = makeProjectRoot("e-srs-4-proj", "<MISSING_FIELD>");
      const argv = ["--onto-home", ontoHome];
      await withEnvExtractMode(undefined, async () => {
        const mode = await resolveReviewSessionExtractMode(argv, projectRoot);
        assertEqual(mode, "disabled", "no field → default disabled");
      });
    });

    // E-SRS-5 — env var unset + project has NO .onto/settings.json file at all
    //           → readConfigAt returns {}, resolver falls through to default.
    it("E-SRS-5 no project config file defaults to disabled", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-5-home", { layout });
      const projectRoot = makeProjectRoot("e-srs-5-proj"); // no settings.json
      const argv = ["--onto-home", ontoHome];
      await withEnvExtractMode(undefined, async () => {
        const mode = await resolveReviewSessionExtractMode(argv, projectRoot);
        assertEqual(mode, "disabled", "no config file → default disabled");
      });
    });

    // E-SRS-6 — project config has an INVALID learning_extract_mode value →
    //           resolver throws via validateExtractMode. Fail-fast, no silent
    //           fallback to default.
    it("E-SRS-6 invalid config value fails fast", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-6-home", { layout });
      const projectRoot = makeProjectRoot("e-srs-6-proj", "not-a-real-mode");
      const argv = ["--onto-home", ontoHome];
      let caught: unknown = null;
      await withEnvExtractMode(undefined, async () => {
        try {
          await resolveReviewSessionExtractMode(argv, projectRoot);
        } catch (e) {
          caught = e;
        }
      });
      assert(caught instanceof Error, "invalid config throws");
      assert(
        (caught as Error).message.includes("not-a-real-mode"),
        "error names the bad value",
      );
      assert(
        (caught as Error).message.toLowerCase().includes("invalid"),
        "error explains invalid",
      );
    });

    // E-SRS-7 — env var set to an INVALID value → resolver throws. Regression:
    //           this was the existing behavior before the config field was
    //           added, verify it still holds when config is ALSO present.
    it("E-SRS-7 invalid env var fails fast (overrides config)", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-7-home", { layout });
      const projectRoot = makeProjectRoot("e-srs-7-proj", "shadow"); // valid config
      const argv = ["--onto-home", ontoHome];
      let caught: unknown = null;
      await withEnvExtractMode("totally-bogus", async () => {
        try {
          await resolveReviewSessionExtractMode(argv, projectRoot);
        } catch (e) {
          caught = e;
        }
      });
      assert(caught instanceof Error, "invalid env var throws");
      assert(
        (caught as Error).message.includes("totally-bogus"),
        "error names the env var bad value, not the config value",
      );
    });

    // E-SRS-8 — home-level config has shadow + project config has active →
    //           project wins (resolveConfigChain merge order). Exercises the
    //           4-tier merge so this test also pins the chain semantics for
    //           the new field.
    it("E-SRS-8 project config overrides home config for extract mode", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-8-home", {
        layout,
        homeConfigExtractMode: "shadow",
      });
      const projectRoot = makeProjectRoot("e-srs-8-proj", "active");
      const argv = ["--onto-home", ontoHome];
      await withEnvExtractMode(undefined, async () => {
        const mode = await resolveReviewSessionExtractMode(argv, projectRoot);
        assertEqual(mode, "active", "project active overrides home shadow");
      });
    });

    // E-SRS-9 — home-level config has shadow + project config missing field →
    //           home value is used (merge surfaces homeConfig's value when
    //           projectConfig has no field to override with).
    it("E-SRS-9 home config value used when project has no field", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-9-home", {
        layout,
        homeConfigExtractMode: "shadow",
      });
      const projectRoot = makeProjectRoot("e-srs-9-proj", "<MISSING_FIELD>");
      const argv = ["--onto-home", ontoHome];
      await withEnvExtractMode(undefined, async () => {
        const mode = await resolveReviewSessionExtractMode(argv, projectRoot);
        assertEqual(mode, "shadow", "home shadow surfaces when project has no field");
      });
    });

    // E-SRS-11 — env unset + project has MALFORMED .onto/settings.json (invalid
    //            YAML that fails to parse) → resolver swallows the read/parse
    //            failure and falls through to default "disabled". Pins the
    //            narrowed try/catch contract: only config read/parse is
    //            best-effort. Regression lock for the review's coverage gap:
    //            previously no test directly exercised the catch branch.
    it("E-SRS-11 malformed project config falls through to default", async () => {
      const ontoHome = makeFakeOntoHome("e-srs-11-home", { layout });
      const projectRoot = makeTmpDir("e-srs-11-proj");
      fs.mkdirSync(path.join(projectRoot, ".onto"), { recursive: true });
      // Write syntactically invalid YAML. `yaml` parser will throw on the
      // unclosed flow mapping / mismatched indentation below.
      fs.writeFileSync(
        path.join(projectRoot, ".onto", "settings.json"),
        "learning_extract_mode: [unterminated\n  : : : not valid yaml\n",
        "utf8",
      );
      const argv = ["--onto-home", ontoHome];
      await withEnvExtractMode(undefined, async () => {
        const mode = await resolveReviewSessionExtractMode(argv, projectRoot);
        assertEqual(
          mode,
          "disabled",
          "malformed config read/parse failure → default disabled",
        );
      });
    });
  },
);

// ---------------------------------------------------------------------------
// Layout-independent tests — the bogus-onto-home path does not construct a
// valid installation, so the roles layout option does not apply here.
// ---------------------------------------------------------------------------

describe("start-review-session E2E (layout-independent)", () => {
  // E-SRS-10 — invalid --onto-home (directory exists but fails isOntoRoot)
  //            → resolveOntoHome throws a HARD error. The resolver MUST NOT
  //            silently fall through to default "disabled". Pins the
  //            exception-boundary contract: resolveOntoHome is called OUTSIDE
  //            the swallowed try, so invalid --onto-home surfaces as a startup
  //            error. Regression lock for the 9-lens consensus finding.
  it("E-SRS-10 invalid --onto-home fails fast (not swallowed)", async () => {
    // A real directory that is NOT an onto root (no package.json with
    // name "onto-core", no roles/ or .onto/roles/, no .onto/authority/).
    const bogusOntoHome = makeTmpDir("e-srs-10-bogus-home");
    const projectRoot = makeProjectRoot("e-srs-10-proj", "shadow");
    const argv = ["--onto-home", bogusOntoHome];
    let caught: unknown = null;
    await withEnvExtractMode(undefined, async () => {
      try {
        await resolveReviewSessionExtractMode(argv, projectRoot);
      } catch (e) {
        caught = e;
      }
    });
    assert(
      caught instanceof Error,
      "invalid --onto-home must throw, not fall through to default",
    );
    assert(
      (caught as Error).message.toLowerCase().includes("onto"),
      "error mentions onto-home / onto root context",
    );
  });

  // E-SRS-11 — Phase 6 review follow-up (UNIQ-U1). Prior fixtures only
  // created legacy `authority/`. Pin canonical `.onto/authority/` as a
  // valid onto-home marker via the end-to-end resolver path (not just
  // isOntoRoot unit tests).
  it("E-SRS-11 canonical .onto/authority/ is accepted by resolveOntoHome (Phase 6)", async () => {
    const ontoHome = makeFakeOntoHome("e-srs-11-home", {
      layout: "phase3",
      authorityLayout: "phase6",
    });
    const projectRoot = makeProjectRoot("e-srs-11-proj", "active");
    const argv = ["--onto-home", ontoHome];
    await withEnvExtractMode(undefined, async () => {
      const mode = await resolveReviewSessionExtractMode(argv, projectRoot);
      assertEqual(mode, "active", "resolver accepts canonical phase6 authority layout");
    });
  });
});
