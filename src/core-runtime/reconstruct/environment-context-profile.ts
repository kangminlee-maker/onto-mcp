import { createHash } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// environment-context-profile — deterministic environment/tech-stack profile of the reconstruct
// target (design 20260720 env-context-profile crossverify-synthesis §0, Stage 0 minimal path).
// A set-tier SIBLING: LLM-free and pure — persisted-observation-derived signals in (a bounded file
// census of basenames/extensions plus the opt-in import inventory), a closed-vocabulary detection
// set out. The module NEVER reads the filesystem or an artifact and NEVER emits raw paths, package
// names, secret keys, or any other domain-meaning channel — the caller projects the persisted
// artifacts down to the bounded input below (set-tier idiom).
//
// SCOPE (owner-confirmed 2026-07-20): Stage 0 = existing census only, NO new filesystem scan.
// Detection derives from file EXISTENCE (basename), extension distribution, and the captured import
// specifiers. Content parsing (manifest dependency lists, engine pins) and the known-signal dotdir
// scan (`.github/workflows`) are deferred (Stage 3 / follow-up). Honest coverage gaps — dotdirs,
// files below the census depth/entry cap — are disclosed in `coverage`, never silently implied away.
//
// BOUNDARY (M2 + closed-vocabulary barrier): the profile is disclosure-only. The caller wires it to
// an artifact + artifactRef ONLY, never to the seed userPayload. Every output field is drawn from a
// closed vocabulary: `category`/`canonical_name` come from the rule catalog (no free text ever),
// `scope_id` is a path-free structural token, `signal_refs` are closed structural tokens (a raw
// import specifier or file basename that does not MATCH a catalog rule never enters the output).
// ─────────────────────────────────────────────────────────────────────────────

export const ENVIRONMENT_CONTEXT_PROFILE_SCHEMA_VERSION = "1" as const;
export const ENVIRONMENT_CONTEXT_PROFILE_REALIZATION = "deterministic" as const;
/** Rule-catalog + synthesis-logic identity. BUMP whenever the catalog or combine rules change —
 *  it is folded into the fingerprint so a ruleset revision can never silently reuse a stale
 *  profile even when the observed files are byte-identical (M5). */
export const ENVIRONMENT_CONTEXT_PROFILE_RULESET_VERSION = "envprofile:v1" as const;
/** Manifest content-parse logic identity (Stage 3a). BUMP whenever the parseable-basename sets,
 *  the per-format extraction, or the version sanitizer change — it is folded into the fingerprint
 *  (ONLY when content parsing ran) so a parser-logic revision can never silently reuse a stale
 *  profile even when the raw file bytes are unchanged (M5). Absent from the fingerprint when the
 *  content opt-in is off, so an off run stays byte-identical to Stage 0.5. */
export const ENVIRONMENT_CONTENT_PARSE_VERSION = "envcontent:v1" as const;

export type EnvironmentDetectionCategory =
  | "language"
  | "runtime"
  | "framework"
  | "package_manager"
  | "infrastructure";

export type EnvironmentDetectionConfidence = "certain" | "likely" | "weak";

/** Closed method vocabulary — the structural evidence class a signal came from. */
export type EnvironmentSignalMethod =
  | "manifest_basename"
  | "config_basename"
  | "extension_distribution"
  | "import_specifier"
  // A dependency DECLARED in a statically-parsed manifest (Stage 3a content_parse) — e.g. `react`
  // in package.json `dependencies`. A distinct evidence class from `import_specifier` (declaration
  // vs usage), so the two independently corroborate a detection. Only catalog-matched dep names
  // produce this signal; a domain dependency never matches and is never emitted.
  | "manifest_dependency"
  // A signal identified by a file's PATH shape rather than its bare basename (e.g. a CI workflow
  // under `.github/workflows/`). The rel_path is used only for matching — never emitted.
  | "path_signal";

export interface EnvironmentContextDetection {
  detection_id: string;
  category: EnvironmentDetectionCategory;
  /** Closed catalog value (never free text). */
  canonical_name: string;
  /** Path-free structural scope token ("root" for the target root / single-package targets;
   *  "package:N" for additional manifest-bearing package roots). The token→path map is
   *  deliberately NOT emitted (boundary: paths carry domain meaning). */
  scope_id: string;
  confidence: EnvironmentDetectionConfidence;
  /** Distinct method classes that contributed (sorted) — the deterministic combine basis. */
  methods: EnvironmentSignalMethod[];
  /** Closed structural signal tokens (e.g. "manifest:package.json", "ext:.ts", "import:react").
   *  Only catalog-matched signals produce a token, so no raw domain string can appear here. */
  signal_refs: string[];
  /** Closed-key structural properties from manifest content_parse (Stage 3a), present only when
   *  content parsing contributed one. The KEY set is closed (`runtime_version_constraint`,
   *  `module_type`); values are sanitized closed forms (a version constraint is charset-restricted +
   *  shape-validated so a dependency path/org name can never leak through this channel). Attached to
   *  the runtime detection the properties describe (e.g. `runtime:node`). Omitted when empty. */
  properties?: Record<string, string>;
}

/** A mutual-exclusion collision (both detections are preserved — the profile never silently
 *  collapses a conflict to one label). Polyglot coexistence is NOT a conflict. */
export interface EnvironmentContextConflict {
  scope_id: string;
  conflict_group: string;
  detection_ids: string[];
}

export interface EnvironmentContextProfileCoverage {
  /** Files the bounded census saw (basename-level). */
  census_entry_count: number;
  /** The census is a BOUNDED walk, never a complete tree scan — detections cover only what it saw
   *  within these limits. Unseen zones: files below `max_depth`, beyond the per-directory entry cap,
   *  inside a dot-directory (e.g. `.github/workflows` CI signals), or under a vendored/`node_modules`
   *  directory. Disclosed as structural constants (not a per-run "capped" boolean, which can neither
   *  see the depth cut nor distinguish a genuinely-large tree) so the profile is never read as a
   *  completeness claim. */
  census_bounds: {
    max_entries_per_directory_ref: number;
    max_depth: number;
    dotdirs_excluded: true;
    vendored_dirs_excluded: true;
  };
  /** The profile-specific known-signal scan that augments the bounded census (finds manifests the
   *  general walk buried + `.github/workflows` CI). `truncated` = the scan hit its dirent cap. */
  signal_scan: { truncated: boolean; max_depth: number; max_dirents: number };
  /** Whether the import inventory was captured (set-tier opt-in) — false ⇒ import-based framework
   *  detection was unavailable this run (basename/extension only). */
  imports_available: boolean;
  /** Count of distinct scope tokens: the target root ("root") plus each DEEPER package root. A
   *  manifest-less target still reports 1 (everything is root-scoped). */
  scope_count: number;
  /** Manifest content-parse coverage (Stage 3a) — PRESENT ONLY when the content opt-in ran (absent
   *  when off, so an off profile stays byte-identical to Stage 0.5). The honest failure taxonomy:
   *  `parsed` = statically read + extracted; `parse_error` = malformed; `truncated` = exceeded the
   *  byte cap (not trusted); `unsupported` = a dependency-declaring manifest whose format is not yet
   *  statically parsed (TOML/text — fast-follow). `true_silence` = parsed>0 with zero catalog-matched
   *  dependency contributions AND unsupported==0 (a genuine "no framework declared", distinguishable
   *  from "could not read"). */
  content_parse?: {
    files_read: number;
    parsed: number;
    parse_error: number;
    truncated: number;
    unsupported: number;
    true_silence: boolean;
  };
}

export interface EnvironmentContextProfileResult {
  schema_version: typeof ENVIRONMENT_CONTEXT_PROFILE_SCHEMA_VERSION;
  realization: typeof ENVIRONMENT_CONTEXT_PROFILE_REALIZATION;
  ruleset_version: typeof ENVIRONMENT_CONTEXT_PROFILE_RULESET_VERSION;
  detections: EnvironmentContextDetection[];
  conflicts: EnvironmentContextConflict[];
  coverage: EnvironmentContextProfileCoverage;
  fingerprint: string;
}

// ── caller-projected input (the module never touches fs/artifacts — set-tier idiom) ───────────

/** One file-existence census row (from targetMaterialProfile.detection.per_ref). rel_path is the
 *  target-relative path; the module uses it only for scope grouping + fingerprint folding and
 *  NEVER emits it. */
export interface EnvironmentCensusFile {
  rel_path: string;
  exists: boolean;
}

/** One observed file carrying structural_data (subset of the census). imports is the captured
 *  to_specifier list (empty when the set-tier opt-in did not capture imports). */
export interface EnvironmentObservedFile {
  rel_path: string;
  language: string | null;
  content_sha256: string | null;
  imports: string[];
}

/** The structural bounds of the reused target census walk (single-sourced from
 *  target-material-kind by the caller). The census is NOT a complete tree scan — it is bounded by
 *  these limits AND excludes dotdirs, so detections cover only what the walk saw. Echoed into the
 *  coverage disclosure so the profile never silently implies completeness (design M4/coverage). */
export interface EnvironmentCensusWalkBounds {
  max_entries_per_directory_ref: number;
  max_depth: number;
}

/** Per-manifest outcome of the Stage 3a content parse (honest failure taxonomy). `parsed` carries
 *  the extracted signals; the others carry none (a failure is disclosed, NEVER fabricated away). */
export type ManifestParseStatus = "parsed" | "parse_error" | "truncated" | "unsupported";

/** One statically-parsed dependency manifest (Stage 3a), projected to a rel_path key by the caller
 *  (the content-parse module works in absolute paths; the caller relativizes — scan→projection→
 *  assembler idiom). `declared_packages` are the raw lowercased dependency NAMES read from the file;
 *  they transit through the assembler which emits ONLY catalog-matched detections — a raw name never
 *  reaches the profile output. `content_sha256` is the digest of the bytes actually read (folded
 *  into the fingerprint so a manifest edit invalidates a stale profile); null when nothing was read
 *  (`unsupported`). */
export interface EnvironmentContentManifest {
  rel_path: string;
  status: ManifestParseStatus;
  declared_packages: string[];
  runtime_version_constraint: string | null;
  module_type: string | null;
  content_sha256: string | null;
}

export interface EnvironmentContextProfileInput {
  census: EnvironmentCensusFile[];
  observations: EnvironmentObservedFile[];
  census_walk_bounds: EnvironmentCensusWalkBounds;
  imports_available: boolean;
  /** The profile-specific known-signal scan that augments the bounded census (environment-signal-
   *  scan.ts). `truncated` = the scan hit its dirent cap, so some subtree was unscanned. */
  signal_scan: { truncated: boolean; max_depth: number; max_dirents: number };
  /** Statically-parsed manifest contents (Stage 3a content_parse). UNDEFINED ⇒ the content opt-in
   *  did not run: no dependency/property contributions, no content_parse coverage block, and the
   *  content provenance is EXCLUDED from the fingerprint — the profile is byte-identical to Stage 0.5.
   *  An empty array ⇒ the opt-in ran but found no parseable manifest (coverage block emitted, zeros). */
  content_manifests?: EnvironmentContentManifest[];
}

// ── rule catalog (data table — a new signal is a new row; every emitted value is closed) ───────

type SignalStrength = "decisive" | "strong" | "weak";

interface CatalogEmit {
  category: EnvironmentDetectionCategory;
  canonical_name: string;
  strength: SignalStrength;
  /** Signals sharing a correlation_group collapse to their MAX strength before the independence
   *  bump, so a manifest + its own lockfile never double-count as two independent corroborations
   *  (M3 correlated-evidence dedup). */
  correlation_group?: string;
  /** Mutual-exclusion set — ≥2 distinct certain canonical_names in the same group + scope is a
   *  conflict (both preserved). */
  conflict_group?: string;
}

/** Exact-basename rules (lowercased). */
const BASENAME_RULES: Record<string, CatalogEmit[]> = {
  // language + package-manager manifests
  "package.json": [{ category: "runtime", canonical_name: "node", strength: "strong", correlation_group: "node" }],
  "tsconfig.json": [{ category: "language", canonical_name: "typescript", strength: "decisive" }],
  "jsconfig.json": [{ category: "language", canonical_name: "javascript", strength: "strong" }],
  "cargo.toml": [
    { category: "language", canonical_name: "rust", strength: "decisive", correlation_group: "rust" },
    { category: "package_manager", canonical_name: "cargo", strength: "strong", correlation_group: "cargo", conflict_group: "js_package_manager" },
  ],
  "go.mod": [
    { category: "language", canonical_name: "go", strength: "decisive", correlation_group: "go" },
    { category: "package_manager", canonical_name: "go_modules", strength: "strong", correlation_group: "go" },
  ],
  "requirements.txt": [
    { category: "language", canonical_name: "python", strength: "strong", correlation_group: "python" },
    { category: "package_manager", canonical_name: "pip", strength: "strong", correlation_group: "python_pm", conflict_group: "python_package_manager" },
  ],
  "pyproject.toml": [{ category: "language", canonical_name: "python", strength: "strong", correlation_group: "python" }],
  "pipfile": [
    { category: "language", canonical_name: "python", strength: "strong", correlation_group: "python" },
    { category: "package_manager", canonical_name: "pipenv", strength: "strong", correlation_group: "python_pm", conflict_group: "python_package_manager" },
  ],
  "setup.py": [{ category: "language", canonical_name: "python", strength: "strong", correlation_group: "python" }],
  "gemfile": [
    { category: "language", canonical_name: "ruby", strength: "decisive", correlation_group: "ruby" },
    { category: "package_manager", canonical_name: "bundler", strength: "strong", correlation_group: "ruby_pm" },
  ],
  "pom.xml": [
    { category: "language", canonical_name: "java", strength: "strong", correlation_group: "jvm" },
    { category: "package_manager", canonical_name: "maven", strength: "strong", correlation_group: "jvm_pm", conflict_group: "jvm_package_manager" },
  ],
  "build.gradle": [
    { category: "language", canonical_name: "java", strength: "strong", correlation_group: "jvm" },
    { category: "package_manager", canonical_name: "gradle", strength: "strong", correlation_group: "jvm_pm", conflict_group: "jvm_package_manager" },
  ],
  "build.gradle.kts": [
    { category: "language", canonical_name: "kotlin", strength: "strong", correlation_group: "jvm" },
    { category: "package_manager", canonical_name: "gradle", strength: "strong", correlation_group: "jvm_pm", conflict_group: "jvm_package_manager" },
  ],
  "composer.json": [
    { category: "language", canonical_name: "php", strength: "strong", correlation_group: "php" },
    { category: "package_manager", canonical_name: "composer", strength: "strong", correlation_group: "php_pm" },
  ],
  // JS/TS package-manager lockfiles (decisive for the chosen pm; conflict if ≥2)
  "package-lock.json": [{ category: "package_manager", canonical_name: "npm", strength: "decisive", correlation_group: "node", conflict_group: "js_package_manager" }],
  "yarn.lock": [{ category: "package_manager", canonical_name: "yarn", strength: "decisive", correlation_group: "node", conflict_group: "js_package_manager" }],
  "pnpm-lock.yaml": [{ category: "package_manager", canonical_name: "pnpm", strength: "decisive", correlation_group: "node", conflict_group: "js_package_manager" }],
  "bun.lockb": [{ category: "package_manager", canonical_name: "bun", strength: "decisive", correlation_group: "node", conflict_group: "js_package_manager" }],
  "poetry.lock": [
    { category: "language", canonical_name: "python", strength: "strong", correlation_group: "python" },
    { category: "package_manager", canonical_name: "poetry", strength: "decisive", correlation_group: "python_pm", conflict_group: "python_package_manager" },
  ],
  // framework config basenames (config_basename method)
  "next.config.js": [{ category: "framework", canonical_name: "nextjs", strength: "strong" }],
  "next.config.mjs": [{ category: "framework", canonical_name: "nextjs", strength: "strong" }],
  "next.config.ts": [{ category: "framework", canonical_name: "nextjs", strength: "strong" }],
  "nuxt.config.js": [{ category: "framework", canonical_name: "nuxt", strength: "strong" }],
  "nuxt.config.ts": [{ category: "framework", canonical_name: "nuxt", strength: "strong" }],
  "vite.config.js": [{ category: "framework", canonical_name: "vite", strength: "strong" }],
  "vite.config.ts": [{ category: "framework", canonical_name: "vite", strength: "strong" }],
  "svelte.config.js": [{ category: "framework", canonical_name: "svelte", strength: "strong" }],
  "angular.json": [{ category: "framework", canonical_name: "angular", strength: "strong" }],
  "vue.config.js": [{ category: "framework", canonical_name: "vue", strength: "strong" }],
  "remix.config.js": [{ category: "framework", canonical_name: "remix", strength: "strong" }],
  "astro.config.mjs": [{ category: "framework", canonical_name: "astro", strength: "strong" }],
  "gatsby-config.js": [{ category: "framework", canonical_name: "gatsby", strength: "strong" }],
  "manage.py": [{ category: "framework", canonical_name: "django", strength: "strong" }],
  "artisan": [{ category: "framework", canonical_name: "laravel", strength: "strong" }],
  // infrastructure
  "dockerfile": [{ category: "infrastructure", canonical_name: "docker", strength: "decisive" }],
  "docker-compose.yml": [{ category: "infrastructure", canonical_name: "docker_compose", strength: "strong" }],
  "docker-compose.yaml": [{ category: "infrastructure", canonical_name: "docker_compose", strength: "strong" }],
  "compose.yml": [{ category: "infrastructure", canonical_name: "docker_compose", strength: "strong" }],
  "compose.yaml": [{ category: "infrastructure", canonical_name: "docker_compose", strength: "strong" }],
  "serverless.yml": [{ category: "infrastructure", canonical_name: "serverless", strength: "strong" }],
  "vercel.json": [{ category: "infrastructure", canonical_name: "vercel", strength: "weak" }],
  "netlify.toml": [{ category: "infrastructure", canonical_name: "netlify", strength: "weak" }],
  "makefile": [{ category: "infrastructure", canonical_name: "make", strength: "weak" }],
};

/** Package-defining manifest basenames — a directory holding one is a package root (scope). */
const PACKAGE_ROOT_BASENAMES = new Set<string>([
  "package.json", "cargo.toml", "go.mod", "pyproject.toml", "setup.py",
  "pipfile", "gemfile", "pom.xml", "build.gradle", "build.gradle.kts", "composer.json",
]);

/** Extension → language (extension_distribution method — capped at `likely`, NEVER a framework). */
const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python", ".rs": "rust", ".go": "go", ".rb": "ruby",
  ".java": "java", ".kt": "kotlin", ".php": "php", ".cs": "csharp", ".swift": "swift",
  ".c": "c", ".cc": "cpp", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
};

/** Import specifier (bare package / module prefix) → detections. Only catalog entries produce a
 *  signal — an unmatched specifier (e.g. a domain package name) never enters the output. */
const IMPORT_RULES: Array<{ prefix: string; emit: CatalogEmit[] }> = [
  { prefix: "react", emit: [{ category: "framework", canonical_name: "react", strength: "strong" }] },
  { prefix: "react-dom", emit: [{ category: "framework", canonical_name: "react", strength: "strong" }] },
  { prefix: "next", emit: [{ category: "framework", canonical_name: "nextjs", strength: "strong" }] },
  { prefix: "vue", emit: [{ category: "framework", canonical_name: "vue", strength: "strong" }] },
  { prefix: "@angular/core", emit: [{ category: "framework", canonical_name: "angular", strength: "strong" }] },
  { prefix: "svelte", emit: [{ category: "framework", canonical_name: "svelte", strength: "strong" }] },
  { prefix: "express", emit: [{ category: "framework", canonical_name: "express", strength: "strong" }] },
  { prefix: "fastify", emit: [{ category: "framework", canonical_name: "fastify", strength: "strong" }] },
  { prefix: "koa", emit: [{ category: "framework", canonical_name: "koa", strength: "strong" }] },
  { prefix: "@nestjs/core", emit: [{ category: "framework", canonical_name: "nestjs", strength: "strong" }] },
  { prefix: "django", emit: [
    { category: "framework", canonical_name: "django", strength: "strong" },
    { category: "language", canonical_name: "python", strength: "strong", correlation_group: "python" },
  ] },
  { prefix: "flask", emit: [
    { category: "framework", canonical_name: "flask", strength: "strong" },
    { category: "language", canonical_name: "python", strength: "strong", correlation_group: "python" },
  ] },
  { prefix: "fastapi", emit: [
    { category: "framework", canonical_name: "fastapi", strength: "strong" },
    { category: "language", canonical_name: "python", strength: "strong", correlation_group: "python" },
  ] },
];

/** Path-shape rules — signals identified by WHERE a file sits, not its bare basename (e.g. a CI
 *  workflow under `.github/workflows/`, which the basename table can't express). `test` reads the
 *  target-relative path; `signal_token` is the closed structural token emitted to signal_refs (the
 *  path itself is NEVER emitted — boundary). CI is repo-wide, so these always scope to "root". */
interface PathSignalRule {
  rule_id: string;
  /** RegExp (not a closure) so the fingerprint can fold `pattern.source`/`.flags` — stable literal
   *  strings, unlike a transpiler-dependent `Function.toString()`. */
  pattern: RegExp;
  emit: CatalogEmit;
  signal_token: string;
}
const PATH_SIGNAL_RULES: readonly PathSignalRule[] = [
  {
    rule_id: "github_actions_workflow",
    pattern: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i,
    emit: { category: "infrastructure", canonical_name: "github_actions", strength: "strong" },
    signal_token: "ci:github_actions",
  },
];

/** The closed allowlist of KNOWN environment-signal basenames — the union of the basename rule
 *  table and the package-root manifests. Exported so the profile-specific known-signal SCAN
 *  (environment-signal-scan.ts) collects exactly the files these rules can act on, single-sourced
 *  from this module (a new catalog row automatically extends what the scan looks for). Lowercased. */
export const KNOWN_SIGNAL_BASENAMES: ReadonlySet<string> = new Set<string>([
  ...Object.keys(BASENAME_RULES),
  ...PACKAGE_ROOT_BASENAMES,
]);

/** Path-shape patterns the profile can act on (from PATH_SIGNAL_RULES) — the known-signal scan
 *  collects files matching these too, so a path-detected signal (CI workflows) is found even
 *  when its basename isn't in the basename allowlist. Single-sourced from the rule table. */
export const KNOWN_SIGNAL_PATH_PATTERNS: readonly RegExp[] = PATH_SIGNAL_RULES.map((r) => r.pattern);

/** Dot-directories the known-signal scan is allowed to ENTER (all other dotdirs are skipped). Only
 *  `.github` carries an environment signal (CI workflows); everything else under a dot-directory is
 *  noise/vendored for profiling purposes. */
export const KNOWN_SIGNAL_DOTDIRS: ReadonlySet<string> = new Set<string>([".github"]);

/** Dependency-declaring manifests whose content the Stage 3a content_parse reads STATICALLY (native
 *  JSON.parse — no code execution). Scoped to package.json (owner 2026-07-21: "package.json 계열만"),
 *  the high-value target: declared deps → framework even without a captured import; `engines.node` →
 *  runtime version; `type` → module mode. Lowercased. Single-sourced: the content-parse module reads
 *  exactly these. */
export const JSON_DEP_MANIFEST_BASENAMES: ReadonlySet<string> = new Set<string>([
  "package.json",
]);

/** Dependency-declaring manifests whose dependencies content_parse does not extract into detections
 *  yet (TOML / plain-text / code-config, or a JSON ecosystem with no catalog rules like composer.json
 *  php). Reported as `unsupported` — an honest gap distinguishing "did not read" from "read and found
 *  nothing", a clean fast-follow. Language detection from their basename is unaffected (existence-only,
 *  Stage 0). Lowercased. */
export const UNSUPPORTED_DEP_MANIFEST_BASENAMES: ReadonlySet<string> = new Set<string>([
  "cargo.toml", "pyproject.toml", "requirements.txt", "pipfile", "setup.py",
  "gemfile", "pom.xml", "build.gradle", "build.gradle.kts", "go.mod", "composer.json",
]);

/** The single closed-vocabulary authority for the version-constraint property channel (Stage 3a). A
 *  version CONSTRAINT is a bounded semver-range token (`>=18`, `^18.0.0`, `18.x`). This restricts to
 *  the version charset + length and requires a digit, so a non-version-shaped value — a `file:`/
 *  `github:`/`link:`/`npm:` dependency spec carrying a path, org, or url — is DROPPED rather than
 *  emitted. Applied at BOTH ends: the content-parse producer sanitizes on read, and the assembler
 *  re-applies it at the emission point so the barrier is capability-surface (structural), not producer
 *  discipline — a future second producer of a manifest row cannot push an unsanitized value into the
 *  emitted `properties`. Space (not `\s`) is the only whitespace allowed: a range uses spaces, never
 *  tabs/newlines. Returns null when not version-shaped. */
export function sanitizeVersionConstraint(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return null;
  // digits, dots, spaces, range/comparison operators, wildcards, pre-release/build separators, a
  // leading `v`. Deliberately NO `/`, `:`, letters (except x/X/v) — those signal a path/url/word.
  if (!/^[0-9. vxX*|,><=~^+-]+$/.test(trimmed)) return null;
  if (!/[0-9]/.test(trimmed)) return null; // a bare operator/word is not a version
  return trimmed;
}

// ── module-local util twins (repo idiom: comprehension-set-tier.ts) ───────────────────────────
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Structural digest of the whole rule catalog. Folded into every profile fingerprint so a catalog
 *  edit (a new/changed row in ANY table) rotates the fingerprint even if a maintainer forgets to
 *  bump {@link ENVIRONMENT_CONTEXT_PROFILE_RULESET_VERSION} — the M5 "rule-table hash" made
 *  structural rather than left to bump discipline. Deterministic (stableJson sorts keys). */
function catalogDigest(): string {
  return sha256Text(stableJson({
    basename_rules: BASENAME_RULES,
    package_root_basenames: [...PACKAGE_ROOT_BASENAMES].sort(),
    extension_language: EXTENSION_LANGUAGE,
    import_rules: IMPORT_RULES,
    // Fold the regex SOURCE/flags (stable literal strings) — never Function.toString() (transpiler-
    // dependent, non-deterministic across environments).
    path_signal_rules: PATH_SIGNAL_RULES.map((r) => ({
      rule_id: r.rule_id,
      pattern_source: r.pattern.source,
      pattern_flags: r.pattern.flags,
      emit: r.emit,
      signal_token: r.signal_token,
    })),
  }));
}

/** Deepest directory that is a component-wise ancestor of every given path. Pure path math (no fs):
 *  the caller uses it to relativize absolute census/observation refs so scope tokens + the
 *  fingerprint stay path-portable. Empty input → "". A single path → the path itself (the caller's
 *  basename fallback then yields the file name). */
export function deepestCommonDirectory(absPaths: readonly string[]): string {
  const split = absPaths
    .filter((p) => p.length > 0)
    .map((p) => p.split(/[\\/]+/));
  if (split.length === 0) return "";
  let prefix = split[0]!;
  for (const parts of split.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < parts.length && prefix[i] === parts[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  return prefix.join("/");
}

function basenameOf(relPath: string): string {
  const parts = relPath.split(/[\\/]+/).filter((p) => p.length > 0);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

function dirOf(relPath: string): string {
  const parts = relPath.split(/[\\/]+/).filter((p) => p.length > 0);
  return parts.slice(0, -1).join("/");
}

function extensionOf(relPath: string): string {
  const base = basenameOf(relPath);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot) : "";
}

// ── scope resolution (path-free tokens) ───────────────────────────────────────────────────────

/** Assign a path-free scope token to each package-root directory. "root" ALWAYS denotes the target
 *  root itself — a manifest AT the target root maps to "root", every DEEPER package root maps to a
 *  "package:N" token, and any file not enclosed by a deeper package root belongs to "root". This
 *  deliberately does NOT anchor "root" to the shallowest package: with no root-level manifest, a
 *  sub-package must never masquerade as the whole target (which would also swallow true root-level
 *  files like a top-level Dockerfile). The dir→token map stays internal; only the token is emitted. */
function resolveScopes(packageRootDirs: ReadonlySet<string>): {
  scopeOf: (relDir: string) => string;
  scopeCount: number;
} {
  // Only DEEPER package roots get package tokens; a root-level ("") manifest is just "root".
  const deeperRoots = [...packageRootDirs].filter((d) => d !== "").sort();
  const tokenByRoot = new Map<string, string>();
  let nextIndex = 1;
  for (const root of deeperRoots) tokenByRoot.set(root, `package:${nextIndex++}`);
  const scopeOf = (relDir: string): string => {
    // Nearest enclosing DEEPER package root = longest root path that prefixes relDir; none ⇒ "root".
    let bestToken = "root";
    let bestLen = -1;
    for (const root of deeperRoots) {
      if (relDir === root || relDir.startsWith(root + "/")) {
        const len = root.split("/").length;
        if (len > bestLen) {
          bestLen = len;
          bestToken = tokenByRoot.get(root)!;
        }
      }
    }
    return bestToken;
  };
  // "root" is always a scope (the target root); each deeper package adds one.
  return { scopeOf, scopeCount: 1 + deeperRoots.length };
}

// ── confidence combination ────────────────────────────────────────────────────────────────────

interface Contribution {
  strength: SignalStrength;
  method: EnvironmentSignalMethod;
  correlation_group: string | undefined;
  signal_ref: string;
  conflict_group: string | undefined;
}

function combineConfidence(
  category: EnvironmentDetectionCategory,
  contributions: Contribution[],
): EnvironmentDetectionConfidence {
  // Collapse correlated signals to their max strength (M3: manifest + its own lockfile is one
  // corroboration, never two). Groupless signals each stand alone.
  const rank: Record<SignalStrength, number> = { weak: 0, strong: 1, decisive: 2 };
  const byGroup = new Map<string, Contribution>();
  const standalone: Contribution[] = [];
  for (const c of contributions) {
    if (c.correlation_group === undefined) {
      standalone.push(c);
      continue;
    }
    const prior = byGroup.get(c.correlation_group);
    if (prior === undefined || rank[c.strength] > rank[prior.strength]) {
      byGroup.set(c.correlation_group, c);
    }
  }
  const collapsed = [...standalone, ...byGroup.values()];
  const hasDecisive = collapsed.some((c) => c.strength === "decisive");
  const strongContribs = collapsed.filter((c) => c.strength === "strong" || c.strength === "decisive");
  const independentStrongMethods = new Set(strongContribs.map((c) => c.method));

  if (category === "language") {
    if (hasDecisive) return "certain";
    // extension_distribution alone can never exceed likely (G ceiling).
    if (independentStrongMethods.size >= 2) return "certain";
    if (strongContribs.length >= 1) return "likely";
    return "weak";
  }
  // framework / package_manager / infrastructure / runtime
  if (hasDecisive) return "certain";
  if (independentStrongMethods.size >= 2) return "certain";
  if (strongContribs.length >= 1) return "likely";
  return "weak";
}

/** Emits for a DECLARED dependency name (Stage 3a). Reuses {@link IMPORT_RULES} as the single
 *  package catalog: every rule prefix is a bare package name (react, @angular/core, …), so a declared
 *  dependency matches by EXACT equality (unlike an import specifier, which also prefix-matches
 *  sub-paths). An unmatched name (a domain package) returns [] and never contributes — the closed-
 *  vocabulary barrier. */
function dependencyEmits(depName: string): CatalogEmit[] {
  const emits: CatalogEmit[] = [];
  for (const rule of IMPORT_RULES) {
    if (depName === rule.prefix) emits.push(...rule.emit);
  }
  return emits;
}

// ── assembly (the single deterministic entry point) ───────────────────────────────────────────

interface DetectionBucket {
  category: EnvironmentDetectionCategory;
  canonical_name: string;
  scope_id: string;
  contributions: Contribution[];
  conflict_groups: Set<string>;
}

export function assembleEnvironmentContextProfile(
  input: EnvironmentContextProfileInput,
): EnvironmentContextProfileResult {
  // Package-root directories → scope tokens. A directory is a package root iff the census holds a
  // package-defining manifest basename in it.
  const packageRootDirs = new Set<string>();
  for (const file of input.census) {
    if (!file.exists) continue;
    if (PACKAGE_ROOT_BASENAMES.has(basenameOf(file.rel_path))) {
      packageRootDirs.add(dirOf(file.rel_path));
    }
  }
  const { scopeOf, scopeCount } = resolveScopes(packageRootDirs);

  const buckets = new Map<string, DetectionBucket>();
  const addContribution = (
    category: EnvironmentDetectionCategory,
    canonical_name: string,
    scope_id: string,
    contribution: Contribution,
  ): void => {
    const key = `${category} ${canonical_name} ${scope_id}`;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { category, canonical_name, scope_id, contributions: [], conflict_groups: new Set() };
      buckets.set(key, bucket);
    }
    bucket.contributions.push(contribution);
    if (contribution.conflict_group !== undefined) bucket.conflict_groups.add(contribution.conflict_group);
  };

  // Basename signals (manifest_basename / config_basename), from the full census.
  for (const file of input.census) {
    if (!file.exists) continue;
    const base = basenameOf(file.rel_path);
    const rules = BASENAME_RULES[base];
    if (rules === undefined) continue;
    const scope = scopeOf(dirOf(file.rel_path));
    for (const emit of rules) {
      const method: EnvironmentSignalMethod =
        emit.category === "framework" ? "config_basename" : "manifest_basename";
      addContribution(emit.category, emit.canonical_name, scope, {
        strength: emit.strength,
        method,
        correlation_group: emit.correlation_group,
        conflict_group: emit.conflict_group,
        signal_ref: `${method === "config_basename" ? "config" : "manifest"}:${base}`,
      });
    }
  }

  // Path-shape signals (CI etc.) — matched on the rel_path, scoped to "root" (repo-wide). The path
  // is used only for matching; only the closed signal_token is emitted (never the path).
  for (const file of input.census) {
    if (!file.exists) continue;
    for (const rule of PATH_SIGNAL_RULES) {
      if (!rule.pattern.test(file.rel_path)) continue;
      addContribution(rule.emit.category, rule.emit.canonical_name, "root", {
        strength: rule.emit.strength,
        method: "path_signal",
        correlation_group: rule.emit.correlation_group,
        conflict_group: rule.emit.conflict_group,
        signal_ref: rule.signal_token,
      });
    }
  }

  // Extension distribution (language only, capped at likely). Count over BOTH census + observed
  // files (union by rel_path) so extension weight reflects the whole bounded target.
  const extLangByScope = new Map<string, Map<string, { count: number; scope: string; lang: string; ext: string }>>();
  const seenPaths = new Set<string>();
  const noteExtension = (relPath: string): void => {
    if (seenPaths.has(relPath)) return;
    seenPaths.add(relPath);
    const lang = EXTENSION_LANGUAGE[extensionOf(relPath)];
    if (lang === undefined) return;
    const scope = scopeOf(dirOf(relPath));
    const perScope = extLangByScope.get(scope) ?? new Map();
    const cur = perScope.get(lang) ?? { count: 0, scope, lang, ext: extensionOf(relPath) };
    cur.count += 1;
    perScope.set(lang, cur);
    extLangByScope.set(scope, perScope);
  };
  for (const file of input.census) if (file.exists) noteExtension(file.rel_path);
  for (const obs of input.observations) noteExtension(obs.rel_path);
  for (const perScope of extLangByScope.values()) {
    for (const entry of perScope.values()) {
      addContribution("language", entry.lang, entry.scope, {
        strength: "weak",
        method: "extension_distribution",
        correlation_group: undefined,
        conflict_group: undefined,
        signal_ref: `ext:${entry.ext}`,
      });
    }
  }

  // Import specifiers (framework/language) — only when captured, only catalog matches.
  if (input.imports_available) {
    for (const obs of input.observations) {
      const scope = scopeOf(dirOf(obs.rel_path));
      const matchedForObs = new Set<string>();
      for (const specifier of obs.imports) {
        const normalized = specifier.toLowerCase();
        for (const rule of IMPORT_RULES) {
          const p = rule.prefix;
          const isMatch = normalized === p || normalized.startsWith(p + "/") || normalized.startsWith(p + ".");
          if (!isMatch) continue;
          for (const emit of rule.emit) {
            // Dedup identical (canonical_name) import matches within one observation's scope.
            const dedupKey = `${emit.category} ${emit.canonical_name} ${p}`;
            if (matchedForObs.has(dedupKey)) continue;
            matchedForObs.add(dedupKey);
            addContribution(emit.category, emit.canonical_name, scope, {
              strength: emit.strength,
              method: "import_specifier",
              correlation_group: emit.correlation_group,
              conflict_group: emit.conflict_group,
              signal_ref: `import:${p}`,
            });
          }
        }
      }
    }
  }

  // Manifest content_parse (Stage 3a) — declared dependencies + closed properties. Present ONLY when
  // the content opt-in ran (input.content_manifests !== undefined); off ⇒ this whole block is skipped
  // and the profile is byte-identical to Stage 0.5. Only `parsed` manifests contribute; the raw
  // declared names are matched against the catalog (dependencyEmits) and only matches are emitted.
  const propertiesByScope = new Map<string, Record<string, string>>();
  // Count catalog-matched dependency contributions — distinguishes a clean-but-empty content read
  // (`true_silence`, a genuine "no framework declared") from a parse failure, for the Stage 3b trigger.
  let contentDependencyMatches = 0;
  if (input.content_manifests !== undefined) {
    // Iterate in a deterministic rel_path order so the per-scope property last-wins is stable
    // regardless of the caller's array order (contract-level determinism, not just live-path).
    const sortedManifests = [...input.content_manifests].sort((a, b) =>
      a.rel_path < b.rel_path ? -1 : a.rel_path > b.rel_path ? 1 : 0);
    for (const manifest of sortedManifests) {
      if (manifest.status !== "parsed") continue;
      const scope = scopeOf(dirOf(manifest.rel_path));
      // Closed-key properties → the runtime the JS manifest describes (node). Deterministic last-wins
      // by rel_path. The version constraint is RE-SANITIZED here at the emission point (not only in the
      // producer) so the closed-vocabulary barrier is capability-surface: a future producer of a
      // manifest row cannot push an unsanitized value into the emitted `properties`.
      const versionConstraint = manifest.runtime_version_constraint !== null
        ? sanitizeVersionConstraint(manifest.runtime_version_constraint)
        : null;
      if (versionConstraint !== null || manifest.module_type !== null) {
        const props = propertiesByScope.get(scope) ?? {};
        if (versionConstraint !== null) props.runtime_version_constraint = versionConstraint;
        if (manifest.module_type !== null) props.module_type = manifest.module_type;
        propertiesByScope.set(scope, props);
      }
      const matchedForManifest = new Set<string>();
      for (const dep of manifest.declared_packages) {
        for (const emit of dependencyEmits(dep)) {
          // Dedup identical (category, canonical_name) within one manifest's scope.
          const dedupKey = `${emit.category} ${emit.canonical_name}`;
          if (matchedForManifest.has(dedupKey)) continue;
          matchedForManifest.add(dedupKey);
          contentDependencyMatches += 1;
          addContribution(emit.category, emit.canonical_name, scope, {
            strength: emit.strength,
            method: "manifest_dependency",
            correlation_group: emit.correlation_group,
            conflict_group: emit.conflict_group,
            signal_ref: `dep:${dep}`,
          });
        }
      }
    }
  }

  // Materialize detections (deterministic id + order).
  const bucketList = [...buckets.values()].sort((a, b) => {
    if (a.scope_id !== b.scope_id) return a.scope_id < b.scope_id ? -1 : 1;
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    return a.canonical_name < b.canonical_name ? -1 : 1;
  });
  const detections: EnvironmentContextDetection[] = bucketList.map((bucket) => {
    const methods = [...new Set(bucket.contributions.map((c) => c.method))].sort();
    const signal_refs = [...new Set(bucket.contributions.map((c) => c.signal_ref))].sort();
    // Attach content_parse properties to the runtime detection they describe (node — the runtime
    // package.json's engines/type fields belong to). Keys emitted in sorted order for deterministic
    // serialization; omitted entirely when empty (byte-stable with Stage 0.5 for non-node detections).
    const scopedProps = bucket.category === "runtime" && bucket.canonical_name === "node"
      ? propertiesByScope.get(bucket.scope_id)
      : undefined;
    const properties = scopedProps !== undefined && Object.keys(scopedProps).length > 0
      ? Object.fromEntries(Object.entries(scopedProps).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : undefined;
    return {
      detection_id: `${bucket.category}:${bucket.canonical_name}@${bucket.scope_id}`,
      category: bucket.category,
      canonical_name: bucket.canonical_name,
      scope_id: bucket.scope_id,
      confidence: combineConfidence(bucket.category, bucket.contributions),
      methods: methods as EnvironmentSignalMethod[],
      signal_refs,
      ...(properties !== undefined ? { properties } : {}),
    };
  });

  // Conflicts: ≥2 distinct CERTAIN canonical_names sharing a conflict_group in the same scope.
  const conflicts: EnvironmentContextConflict[] = [];
  const detectionById = new Map(detections.map((d) => [d.detection_id, d]));
  const byScopeGroup = new Map<string, Map<string, string[]>>();
  for (const bucket of bucketList) {
    const det = detectionById.get(`${bucket.category}:${bucket.canonical_name}@${bucket.scope_id}`)!;
    if (det.confidence !== "certain") continue;
    for (const group of bucket.conflict_groups) {
      const key = bucket.scope_id;
      const perScope = byScopeGroup.get(key) ?? new Map();
      const ids = perScope.get(group) ?? [];
      ids.push(det.detection_id);
      perScope.set(group, ids);
      byScopeGroup.set(key, perScope);
    }
  }
  for (const [scope_id, perScope] of byScopeGroup) {
    for (const [conflict_group, ids] of perScope) {
      if (ids.length >= 2) {
        conflicts.push({ scope_id, conflict_group, detection_ids: [...ids].sort() });
      }
    }
  }
  conflicts.sort((a, b) =>
    a.scope_id !== b.scope_id ? (a.scope_id < b.scope_id ? -1 : 1)
      : a.conflict_group < b.conflict_group ? -1 : 1);

  const coverage: EnvironmentContextProfileCoverage = {
    census_entry_count: input.census.filter((f) => f.exists).length,
    census_bounds: {
      max_entries_per_directory_ref: input.census_walk_bounds.max_entries_per_directory_ref,
      max_depth: input.census_walk_bounds.max_depth,
      dotdirs_excluded: true,
      vendored_dirs_excluded: true,
    },
    imports_available: input.imports_available,
    scope_count: scopeCount,
    signal_scan: {
      truncated: input.signal_scan.truncated,
      max_depth: input.signal_scan.max_depth,
      max_dirents: input.signal_scan.max_dirents,
    },
  };
  // content_parse coverage — emitted ONLY when the content opt-in ran (undefined ⇒ absent ⇒ Stage 0.5
  // byte-identical). Honest taxonomy counts; `true_silence` = clean read (parsed>0, no unsupported)
  // that surfaced no catalog-matched dependency (a genuine "no framework declared", not a read failure).
  if (input.content_manifests !== undefined) {
    let parsed = 0, parseError = 0, truncated = 0, unsupported = 0;
    for (const m of input.content_manifests) {
      if (m.status === "parsed") parsed += 1;
      else if (m.status === "parse_error") parseError += 1;
      else if (m.status === "truncated") truncated += 1;
      else unsupported += 1;
    }
    coverage.content_parse = {
      files_read: parsed + parseError + truncated,
      parsed,
      parse_error: parseError,
      truncated,
      unsupported,
      true_silence: parsed > 0 && unsupported === 0 && contentDependencyMatches === 0,
    };
  }

  // Fingerprint (M5): fold ruleset identity + the RULE CATALOG DIGEST (so a catalog edit rotates the
  // fingerprint STRUCTURALLY, not only via a manual ruleset_version bump) + walk-bound provenance +
  // the full input snapshot (census path set, observed content hashes + captured imports) so any
  // input drift, ruleset bump, OR catalog change invalidates a stale profile. The hash reveals no
  // paths (it is a digest).
  const fingerprint = sha256Text(stableJson({
    schema_version: ENVIRONMENT_CONTEXT_PROFILE_SCHEMA_VERSION,
    realization: ENVIRONMENT_CONTEXT_PROFILE_REALIZATION,
    ruleset_version: ENVIRONMENT_CONTEXT_PROFILE_RULESET_VERSION,
    catalog_digest: catalogDigest(),
    census_walk_bounds: input.census_walk_bounds,
    imports_available: input.imports_available,
    signal_scan: input.signal_scan,
    census: input.census
      .map((f) => ({ rel_path: f.rel_path, exists: f.exists }))
      .sort((a, b) => (a.rel_path < b.rel_path ? -1 : a.rel_path > b.rel_path ? 1 : 0)),
    observations: input.observations
      .map((o) => ({
        rel_path: o.rel_path,
        content_sha256: o.content_sha256,
        language: o.language,
        imports: [...o.imports].sort(),
      }))
      .sort((a, b) => (a.rel_path < b.rel_path ? -1 : a.rel_path > b.rel_path ? 1 : 0)),
    // Content-parse provenance (Stage 3a) — folded ONLY when the opt-in ran, so an off run's
    // fingerprint is byte-identical to Stage 0.5. Includes the parser-logic version (a parser change
    // rotates the fingerprint even on unchanged bytes) + each manifest's status/content_sha256/
    // extracted values (a manifest edit invalidates a stale profile). Reveals no paths (digest).
    ...(input.content_manifests !== undefined
      ? {
          content_parse_version: ENVIRONMENT_CONTENT_PARSE_VERSION,
          content_manifests: input.content_manifests
            .map((m) => ({
              rel_path: m.rel_path,
              status: m.status,
              content_sha256: m.content_sha256,
              declared_packages: [...m.declared_packages].sort(),
              runtime_version_constraint: m.runtime_version_constraint,
              module_type: m.module_type,
            }))
            .sort((a, b) => (a.rel_path < b.rel_path ? -1 : a.rel_path > b.rel_path ? 1 : 0)),
        }
      : {}),
  }));

  return {
    schema_version: ENVIRONMENT_CONTEXT_PROFILE_SCHEMA_VERSION,
    realization: ENVIRONMENT_CONTEXT_PROFILE_REALIZATION,
    ruleset_version: ENVIRONMENT_CONTEXT_PROFILE_RULESET_VERSION,
    detections,
    conflicts,
    coverage,
    fingerprint,
  };
}
