import { describe, expect, it } from "vitest";
import {
  assembleEnvironmentContextProfile,
  deepestCommonDirectory,
  ENVIRONMENT_CONTEXT_PROFILE_RULESET_VERSION,
  KNOWN_SIGNAL_BASENAMES,
  type EnvironmentCensusFile,
  type EnvironmentContextProfileInput,
  type EnvironmentObservedFile,
} from "./environment-context-profile.js";

// Spec basis (INV-TEST-1): env-context-profile crossverify-synthesis §0 (Stage 0 minimal path,
// owner-confirmed 2026-07-20 = existing census only, no new fs scan). The module contract is
// projected-observation-in / closed-vocabulary-detection-out (no filesystem, no LLM). Tests assert
// the M4 done-when: per-family POSITIVE detections (never a hollow pass), polyglot≥2 languages,
// unknown ⇒ zero certain framework, order-invariant fingerprint, and the closed-vocabulary barrier.

function census(...paths: Array<[string, boolean?]>): EnvironmentCensusFile[] {
  return paths.map(([rel_path, exists]) => ({ rel_path, exists: exists ?? true }));
}

function observed(
  rel_path: string,
  args: { language?: string | null; imports?: string[]; sha?: string | null } = {},
): EnvironmentObservedFile {
  return {
    rel_path,
    language: args.language ?? null,
    content_sha256: args.sha ?? `sha-${rel_path}`,
    imports: args.imports ?? [],
  };
}

function input(args: Partial<EnvironmentContextProfileInput> & {
  census: EnvironmentCensusFile[];
}): EnvironmentContextProfileInput {
  return {
    census: args.census,
    observations: args.observations ?? [],
    census_walk_bounds: args.census_walk_bounds ?? { max_entries_per_directory_ref: 200, max_depth: 3 },
    imports_available: args.imports_available ?? false,
    signal_scan: args.signal_scan ?? { truncated: false, max_depth: 8, max_dirents: 20000 },
  };
}

const find = (
  result: ReturnType<typeof assembleEnvironmentContextProfile>,
  category: string,
  name: string,
  scope = "root",
) => result.detections.find(
  (d) => d.category === category && d.canonical_name === name && d.scope_id === scope,
);

// ── A/C manifest+config basenames (Next.js) ────────────────────────────────────────────────────
describe("basename detection — Next.js + TypeScript project", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(
      ["package.json"],
      ["package-lock.json"],
      ["tsconfig.json"],
      ["next.config.js"],
      ["src/index.ts"],
      ["src/app.tsx"],
    ),
  }));

  it("detects Next.js framework from config basename (POSITIVE, likely)", () => {
    const next = find(result, "framework", "nextjs");
    expect(next).toBeDefined();
    expect(next!.confidence).toBe("likely");
    expect(next!.methods).toContain("config_basename");
    expect(next!.signal_refs).toContain("config:next.config.js");
  });

  it("detects TypeScript language (certain — tsconfig is decisive)", () => {
    const ts = find(result, "language", "typescript");
    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe("certain");
  });

  it("detects the node runtime and npm package manager (decisive lockfile)", () => {
    expect(find(result, "runtime", "node")).toBeDefined();
    const npm = find(result, "package_manager", "npm");
    expect(npm).toBeDefined();
    expect(npm!.confidence).toBe("certain");
  });
});

// ── E import specifiers (Django) ────────────────────────────────────────────────────────────────
describe("import detection — Django backend", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(["manage.py"], ["requirements.txt"], ["app/models.py"], ["app/views.py"]),
    observations: [
      observed("app/models.py", { language: "python", imports: ["django.db", "django.contrib.auth"] }),
      observed("app/views.py", { language: "python", imports: ["django.shortcuts"] }),
    ],
    imports_available: true,
  }));

  it("detects Django framework from BOTH manage.py and imports (certain — 2 independent methods)", () => {
    const django = find(result, "framework", "django");
    expect(django).toBeDefined();
    expect(django!.confidence).toBe("certain");
    expect(django!.methods).toEqual(["config_basename", "import_specifier"]);
    expect(django!.signal_refs).toContain("import:django");
    expect(django!.signal_refs).toContain("config:manage.py");
  });

  it("detects Python language as likely — correlated manifest+import is ONE fact, not a certain bump (M3)", () => {
    const py = find(result, "language", "python");
    expect(py).toBeDefined();
    // requirements.txt (manifest) and the django import both assert "this is python" — the same
    // fact from correlated angles. M3 dedup keeps it at the single-strong ceiling (likely), never
    // stacking correlated evidence into a false certain.
    expect(py!.confidence).toBe("likely");
  });
});

// ── imports NOT captured ⇒ no import method ─────────────────────────────────────────────────────
describe("imports unavailable — set-tier off", () => {
  it("does not use import signals and marks coverage.imports_available false", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["manage.py"], ["app/models.py"]),
      observations: [observed("app/models.py", { language: "python", imports: ["django.db"] })],
      imports_available: false,
    }));
    expect(result.coverage.imports_available).toBe(false);
    const django = find(result, "framework", "django");
    expect(django).toBeDefined();
    expect(django!.methods).toEqual(["config_basename"]); // manage.py only, no import_specifier
    expect(django!.confidence).toBe("likely");
  });
});

// ── G polyglot preservation ─────────────────────────────────────────────────────────────────────
describe("polyglot — Python backend + TS frontend + Docker (no single primary label)", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(
      ["backend/pyproject.toml"],
      ["backend/main.py"],
      ["frontend/package.json"],
      ["frontend/tsconfig.json"],
      ["frontend/src/app.ts"],
      ["Dockerfile"],
    ),
  }));

  it("preserves BOTH languages (≥2, polyglot is not a conflict)", () => {
    const langs = new Set(result.detections.filter((d) => d.category === "language").map((d) => d.canonical_name));
    expect(langs.has("python")).toBe(true);
    expect(langs.has("typescript")).toBe(true);
    expect(langs.size).toBeGreaterThanOrEqual(2);
    expect(result.conflicts).toEqual([]);
  });

  it("detects Docker infrastructure (certain)", () => {
    const docker = find(result, "infrastructure", "docker");
    expect(docker).toBeDefined();
    expect(docker!.confidence).toBe("certain");
  });

  it("scopes backend/frontend as distinct package tokens; root reserved for the true target root", () => {
    // Two DEEPER package roots (backend/, frontend/) + the target root ("") ⇒ scope_count 3. Neither
    // sub-package usurps "root" (rootless-monorepo anchor fix); tokens are path-free.
    expect(result.coverage.scope_count).toBe(3);
    for (const d of result.detections) {
      expect(d.scope_id === "root" || /^package:\d+$/.test(d.scope_id)).toBe(true);
      expect(d.scope_id).not.toContain("backend");
      expect(d.scope_id).not.toContain("frontend");
    }
    // The top-level Dockerfile belongs to the true target root, NOT a sub-package.
    expect(find(result, "infrastructure", "docker", "root")).toBeDefined();
    // The two languages live in distinct package scopes, neither of which is "root".
    const py = result.detections.find((d) => d.canonical_name === "python");
    const ts = result.detections.find((d) => d.canonical_name === "typescript");
    expect(py!.scope_id).toMatch(/^package:\d+$/);
    expect(ts!.scope_id).toMatch(/^package:\d+$/);
    expect(py!.scope_id).not.toBe(ts!.scope_id);
  });
});

// ── rootless monorepo: sub-package must not usurp "root" (anchor fix) ───────────────────────────
describe("rootless monorepo — no target-root manifest", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(
      ["packages/api/go.mod"],       // deeper package, NO manifest at target root
      ["packages/api/main.go"],
      ["packages/web/package.json"],
      ["packages/web/app.ts"],
      ["Dockerfile"],                 // a TRUE root-level file
    ),
  }));

  it("does not let the first sub-package become 'root'", () => {
    const go = result.detections.find((d) => d.canonical_name === "go");
    const node = result.detections.find((d) => d.canonical_name === "node");
    expect(go!.scope_id).toMatch(/^package:\d+$/);
    expect(node!.scope_id).toMatch(/^package:\d+$/);
    expect(go!.scope_id).not.toBe(node!.scope_id);
  });

  it("assigns the true root-level Dockerfile to 'root', not a sub-package", () => {
    const docker = find(result, "infrastructure", "docker", "root");
    expect(docker).toBeDefined();
    // scope_count = root + 2 deeper packages.
    expect(result.coverage.scope_count).toBe(3);
  });
});

// ── coverage honesty: structural walk bounds, never a completeness claim ─────────────────────────
describe("coverage bounds disclosure", () => {
  it("discloses the census walk bounds (depth + entry cap + dotdir exclusion) as constants", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      census_walk_bounds: { max_entries_per_directory_ref: 200, max_depth: 3 },
    }));
    expect(result.coverage.census_bounds).toEqual({
      max_entries_per_directory_ref: 200,
      max_depth: 3,
      dotdirs_excluded: true,
      vendored_dirs_excluded: true,
    });
    // No unreliable per-run "capped" boolean survives (it could neither see the depth cut nor tell a
    // large tree apart) — the honest signal is the structural bound set.
    expect((result.coverage as Record<string, unknown>).census_capped).toBeUndefined();
    // The known-signal scan status is disclosed (augments the bounded census).
    expect(result.coverage.signal_scan).toEqual({ truncated: false, max_depth: 8, max_dirents: 20000 });
  });

  it("propagates scan truncation into coverage (honest gap when the scan hit its cap)", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      signal_scan: { truncated: true, max_depth: 8, max_dirents: 20000 },
    }));
    expect(result.coverage.signal_scan.truncated).toBe(true);
  });
});

// ── unknown ⇒ no certain framework (hollow-pass guard) ──────────────────────────────────────────
describe("unknown project — plain text, no manifests", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(["README.md"], ["notes.txt"], ["data.csv"]),
  }));

  it("emits ZERO framework detections (never invents a certain framework)", () => {
    expect(result.detections.filter((d) => d.category === "framework")).toEqual([]);
    expect(result.detections.every((d) => d.category !== "framework")).toBe(true);
  });

  it("is honest-empty, not a failure", () => {
    expect(result.detections).toEqual([]);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── extension-only language capped at likely (never certain, never framework) ───────────────────
describe("extension-only signals — bare .py files, no manifest", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(["a.py"], ["b.py"], ["c.py"]),
  }));
  it("caps extension-only language at weak/likely and emits no framework", () => {
    const py = find(result, "language", "python");
    expect(py).toBeDefined();
    expect(py!.confidence).not.toBe("certain");
    expect(py!.methods).toEqual(["extension_distribution"]);
    expect(result.detections.filter((d) => d.category === "framework")).toEqual([]);
  });
});

// ── package-manager conflict (both preserved) ───────────────────────────────────────────────────
describe("conflict — competing JS lockfiles in one scope", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(["package.json"], ["package-lock.json"], ["yarn.lock"]),
  }));
  it("flags a package_manager conflict but preserves both detections", () => {
    expect(find(result, "package_manager", "npm")).toBeDefined();
    expect(find(result, "package_manager", "yarn")).toBeDefined();
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].conflict_group).toBe("js_package_manager");
    expect(result.conflicts[0].detection_ids.length).toBe(2);
  });
});

// ── correlated-evidence dedup (M3) ──────────────────────────────────────────────────────────────
describe("correlated evidence — a manifest + a corroborating import is one fact, not a certain bump", () => {
  it("does not stack correlated python signals into a false certain", () => {
    const manifestOnly = assembleEnvironmentContextProfile(input({
      census: census(["pyproject.toml"], ["app.py"]),
    }));
    const manifestPlusImport = assembleEnvironmentContextProfile(input({
      census: census(["pyproject.toml"], ["app.py"]),
      observations: [observed("app.py", { language: "python", imports: ["django.db"] })],
      imports_available: true,
    }));
    // pyproject.toml alone = one strong manifest ⇒ likely.
    expect(find(manifestOnly, "language", "python")!.confidence).toBe("likely");
    // Adding a correlated django import (also ⇒ python) must NOT bump to certain — same fact.
    expect(find(manifestPlusImport, "language", "python")!.confidence).toBe("likely");
  });
});

// ── fingerprint order-invariance + ruleset fold (M5) ────────────────────────────────────────────
describe("fingerprint", () => {
  it("is identical when input file order is shuffled", () => {
    const a = assembleEnvironmentContextProfile(input({
      census: census(["package.json"], ["tsconfig.json"], ["next.config.js"], ["src/a.ts"]),
    }));
    const b = assembleEnvironmentContextProfile(input({
      census: census(["src/a.ts"], ["next.config.js"], ["package.json"], ["tsconfig.json"]),
    }));
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("changes when the file set changes", () => {
    const a = assembleEnvironmentContextProfile(input({ census: census(["package.json"]) }));
    const b = assembleEnvironmentContextProfile(input({ census: census(["package.json"], ["go.mod"]) }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("changes when an observed file's content_sha256 changes", () => {
    const base = { census: census(["a.py"]), observations: [observed("a.py", { sha: "sha-1" })], imports_available: true };
    const a = assembleEnvironmentContextProfile(input({ ...base }));
    const b = assembleEnvironmentContextProfile(input({
      ...base,
      observations: [observed("a.py", { sha: "sha-2" })],
    }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("is a stable snapshot for a fixed input — falsifies if the pre-image fold changes (M5)", () => {
    // A fixed-input SNAPSHOT (not a hollow cross-call equality): this hash pins the exact fingerprint
    // pre-image. Dropping ANY folded component (ruleset_version, catalog_digest, walk_bounds, census,
    // observations) rotates this value and fails the test — the falsifiable guard the hollow prior
    // test lacked. Update deliberately (with a ruleset_version bump) when the fold intentionally changes.
    const fp = assembleEnvironmentContextProfile(input({ census: census(["package.json"]) })).fingerprint;
    expect(fp).toBe("bfd464044a636b7e9d175496d16ec5d32ab9144abe932f538ca4caddeb05cc28");
    expect(ENVIRONMENT_CONTEXT_PROFILE_RULESET_VERSION).toBe("envprofile:v1");
  });

  it("changes when the census walk bounds change (bound provenance is folded)", () => {
    const a = assembleEnvironmentContextProfile(input({ census: census(["package.json"]) }));
    const b = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      census_walk_bounds: { max_entries_per_directory_ref: 500, max_depth: 5 },
    }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

// ── closed-vocabulary barrier (boundary — most important test) ──────────────────────────────────
describe("closed-vocabulary barrier — no domain meaning leaks into the output", () => {
  it("never emits a raw path, a non-catalog import, or an unknown basename", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(
        ["src/patient-records/billing.ts"],       // domain-named path
        ["package.json"],
        ["config/PATIENT_RECORD_BUCKET.env"],       // domain-named file
      ),
      observations: [
        observed("src/patient-records/billing.ts", {
          language: "typescript",
          imports: ["react", "@corp/payroll-tax-engine", "./local-domain-module"],
        }),
      ],
      imports_available: true,
    }));
    const CATEGORIES = new Set(["language", "runtime", "framework", "package_manager", "infrastructure"]);
    const CONFIDENCES = new Set(["certain", "likely", "weak"]);
    for (const d of result.detections) {
      expect(CATEGORIES.has(d.category)).toBe(true);
      expect(CONFIDENCES.has(d.confidence)).toBe(true);
      // scope_id is a path-free token.
      expect(d.scope_id === "root" || /^package:\d+$/.test(d.scope_id)).toBe(true);
      // signal_refs carry only closed structural tokens — never a domain path/name.
      for (const ref of d.signal_refs) {
        expect(ref).toMatch(/^(manifest|config|ext|import):/);
        expect(ref).not.toContain("patient");
        expect(ref).not.toContain("payroll");
        expect(ref).not.toContain("PATIENT_RECORD_BUCKET");
        expect(ref).not.toContain("/");
      }
    }
    // The unknown domain import contributed NOTHING (react did; @corp/payroll did not).
    expect(find(result, "framework", "react")).toBeDefined();
    const allNames = result.detections.map((d) => d.canonical_name).join(" ");
    expect(allNames).not.toContain("payroll");
    expect(allNames).not.toContain("corp");
  });
});

// ── CI path-signal rule + known-signal allowlist ────────────────────────────────────────────────
describe("path-signal rules — GitHub Actions CI from .github/workflows", () => {
  it("detects github_actions from a workflow path (scoped root), emitting only a closed token", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census([".github/workflows/ci.yml"], [".github/workflows/release.yaml"], ["package.json"]),
    }));
    const ci = find(result, "infrastructure", "github_actions", "root");
    expect(ci).toBeDefined();
    expect(ci!.methods).toEqual(["path_signal"]);
    // Only the closed token — never the path.
    expect(ci!.signal_refs).toEqual(["ci:github_actions"]);
    for (const ref of ci!.signal_refs) expect(ref).not.toContain(".github");
  });

  it("does NOT fire on a yml that is not under .github/workflows", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["config/random.yml"], ["docs/.github/notes.yml"]),
    }));
    expect(result.detections.filter((d) => d.canonical_name === "github_actions")).toEqual([]);
  });
});

describe("KNOWN_SIGNAL_BASENAMES allowlist", () => {
  it("covers every basename-rule key and package-root manifest (single source for the scan)", () => {
    expect(KNOWN_SIGNAL_BASENAMES.has("package.json")).toBe(true);
    expect(KNOWN_SIGNAL_BASENAMES.has("dockerfile")).toBe(true);
    expect(KNOWN_SIGNAL_BASENAMES.has("next.config.js")).toBe(true);
    expect(KNOWN_SIGNAL_BASENAMES.has("cargo.toml")).toBe(true);
    expect(KNOWN_SIGNAL_BASENAMES.has("go.mod")).toBe(true);
    // all lowercased (the scan lowercases basenames before membership check)
    for (const b of KNOWN_SIGNAL_BASENAMES) expect(b).toBe(b.toLowerCase());
  });
});

// ── deepestCommonDirectory (path relativization helper) ─────────────────────────────────────────
describe("deepestCommonDirectory", () => {
  it("returns the common ancestor directory of sibling files", () => {
    expect(deepestCommonDirectory(["/repo/src/a.ts", "/repo/src/b.ts"])).toBe("/repo/src");
  });
  it("stops at the divergence point across subtrees", () => {
    expect(deepestCommonDirectory(["/repo/backend/main.py", "/repo/frontend/app.ts"])).toBe("/repo");
  });
  it("handles a single path (returns it whole — caller basename-falls-back)", () => {
    expect(deepestCommonDirectory(["/repo/src/only.ts"])).toBe("/repo/src/only.ts");
  });
  it("returns empty string for empty input", () => {
    expect(deepestCommonDirectory([])).toBe("");
  });
});

// ── determinism ─────────────────────────────────────────────────────────────────────────────────
describe("determinism", () => {
  it("produces byte-identical results across repeated calls", () => {
    const build = () => assembleEnvironmentContextProfile(input({
      census: census(["package.json"], ["next.config.js"], ["backend/go.mod"]),
      observations: [observed("app.ts", { imports: ["react"] })],
      imports_available: true,
    }));
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});
