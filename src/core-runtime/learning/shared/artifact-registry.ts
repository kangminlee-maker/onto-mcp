/**
 * Artifact Registry — DD-20 (central spec management).
 *
 * Design authority:
 *   - learn-phase3-design-v9.md DD-20 (lazy init + RegistryInitError + schema reject)
 *   - learn-phase3-design-v8.md DD-20 (lazy init + write enforcement + pre-v7 reject)
 *   - learn-phase3-design-v7.md DD-20 (introduction + spec contract)
 *
 * Why this exists:
 *   1. Every persisted control artifact in Phase 3 must declare a spec
 *      describing its kind, supported schema versions, formats, and validators.
 *   2. Without central registration, each artifact would re-implement parsing
 *      and version gates ad hoc — v6 review traced multiple drift bugs back to
 *      this pattern.
 *   3. Lazy init means runtime entry points do not need to call initArtifactRegistry()
 *      explicitly. The first REGISTRY.loadFromFile / saveToFile call performs
 *      registration and caches success/failure.
 *
 * CLI-process-scoped runtime assumption (§12.7): Phase 3 commands run in
 * short-lived processes. Init failure caching is per-process and recovery is
 * "restart and re-run" by design. Phase 4 daemon work must revisit this.
 *
 * Write-side enforcement (SYN-CC1):
 *   - validate() runs on every save
 *   - format binding is derived from the file extension and checked against
 *     spec.supported_formats
 *   - schema_version on the data object MUST match spec.current_schema_version;
 *     undefined is rejected (SYN-CONS-03 v9 fix)
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class RegistryInitError extends Error {
  public readonly cause?: Error;
  constructor(message: string, cause?: Error) {
    super(`Artifact registry initialization failed: ${message}`);
    this.name = "RegistryInitError";
    if (cause) this.cause = cause;
  }
}

export class IncompatibleVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompatibleVersionError";
  }
}

export class InvalidArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArtifactError";
  }
}

export class UnregisteredArtifactKindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnregisteredArtifactKindError";
  }
}

export class ArtifactNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Spec contract
// ---------------------------------------------------------------------------

export type ArtifactFormat = "json" | "yaml";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ArtifactSpec<T = unknown> {
  readonly kind: string;
  readonly current_schema_version: string;
  readonly supported_schema_versions: readonly string[];
  readonly supported_formats: readonly ArtifactFormat[];

  parse(content: string, format: ArtifactFormat): T;
  serialize(data: T, format: ArtifactFormat): string;
  validate(data: unknown): ValidationResult;
  /** Mandatory when supported_schema_versions.length > 1 (DD-20 SYN-C2). */
  migrate?: (oldData: unknown, fromVersion: string) => T;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

class ArtifactRegistry {
  private specs = new Map<string, ArtifactSpec>();
  private initialized = false;
  private cachedInitError: RegistryInitError | null = null;
  private builtinRegistrar: (() => void) | null = null;

  /**
   * Inject the built-in spec registrar from artifact-registry-init.ts.
   *
   * The init module is imported lazily (inside ensureInitialized) to break
   * the import cycle: specs need errors from this module, init imports specs,
   * registry needs init. Calling this from artifact-registry-init.ts after
   * spec imports complete keeps the registrar separate from registry core.
   */
  setBuiltinRegistrar(registrar: () => void): void {
    this.builtinRegistrar = registrar;
  }

  /**
   * Lazy initialization. Idempotent.
   *
   * Contract (NQ-19 v9):
   *   - First call: invoke builtinRegistrar
   *   - Subsequent calls: no-op
   *   - On failure: wrap as RegistryInitError, cache, throw on every subsequent
   *     call (CLI-process-scoped recovery is process restart only)
   */
  private ensureInitialized(): void {
    if (this.initialized) return;
    if (this.cachedInitError) throw this.cachedInitError;

    if (!this.builtinRegistrar) {
      // The registrar is wired by artifact-registry-init.ts side-effect import.
      // If callers reach here without that side effect, something invoked the
      // registry before init module loaded — fail loudly.
      this.cachedInitError = new RegistryInitError(
        "no builtin registrar wired. Import 'artifact-registry-init.js' " +
          "from the entry point before using REGISTRY.",
      );
      throw this.cachedInitError;
    }

    try {
      this.builtinRegistrar();
      this.initialized = true;
    } catch (error) {
      this.cachedInitError = new RegistryInitError(
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined,
      );
      throw this.cachedInitError;
    }
  }

  /**
   * Register a spec at init time. Performs structural sanity checks so a
   * mis-declared spec fails at registration rather than at first read/write
   * (SYN-C2 v8 register-time consistency check).
   */
  register<T>(spec: ArtifactSpec<T>): void {
    if (spec.supported_schema_versions.length === 0) {
      throw new Error(
        `${spec.kind}: supported_schema_versions cannot be empty`,
      );
    }
    if (!spec.supported_schema_versions.includes(spec.current_schema_version)) {
      throw new Error(
        `${spec.kind}: current_schema_version "${spec.current_schema_version}" ` +
          `not in supported_schema_versions [${spec.supported_schema_versions.join(", ")}]`,
      );
    }
    if (spec.supported_schema_versions.length > 1 && !spec.migrate) {
      throw new Error(
        `${spec.kind}: supports ${spec.supported_schema_versions.length} schema versions ` +
          `but no migrate function provided`,
      );
    }
    if (spec.supported_formats.length === 0) {
      throw new Error(`${spec.kind}: supported_formats cannot be empty`);
    }
    if (this.specs.has(spec.kind)) {
      throw new Error(`Duplicate artifact kind: ${spec.kind}`);
    }
    this.specs.set(spec.kind, spec as ArtifactSpec);
  }

  get<T>(kind: string): ArtifactSpec<T> {
    this.ensureInitialized();
    const spec = this.specs.get(kind);
    if (!spec) {
      throw new UnregisteredArtifactKindError(
        `Artifact kind '${kind}' not registered. ` +
          `Available: ${[...this.specs.keys()].sort().join(", ")}`,
      );
    }
    return spec as ArtifactSpec<T>;
  }

  loadFromFile<T>(kind: string, filePath: string): T {
    this.ensureInitialized();
    const spec = this.get<T>(kind);

    if (!fs.existsSync(filePath)) {
      throw new ArtifactNotFoundError(`Artifact file not found: ${filePath}`);
    }

    const format = formatFromPath(filePath, kind, spec);
    const content = fs.readFileSync(filePath, "utf8");

    const parsed = spec.parse(content, format);

    const validation = spec.validate(parsed);
    if (!validation.valid) {
      throw new InvalidArtifactError(
        `${kind}: ${validation.errors.join(", ")}`,
      );
    }

    return parsed;
  }

  saveToFile<T>(kind: string, filePath: string, data: T): void {
    this.ensureInitialized();
    const spec = this.get<T>(kind);

    // SYN-CC1 part 1: structural validation before write
    const validation = spec.validate(data);
    if (!validation.valid) {
      throw new InvalidArtifactError(
        `${kind} validation failed: ${validation.errors.join(", ")}`,
      );
    }

    // SYN-CC1 part 2: format binding from extension
    const format = formatFromPath(filePath, kind, spec);

    // SYN-CC1 part 3 + SYN-CONS-03 (v9): schema_version is required and must
    // match spec.current_schema_version. undefined is rejected.
    const dataObj = data as { schema_version?: string };
    if (dataObj.schema_version === undefined) {
      throw new InvalidArtifactError(
        `${kind}: data missing required schema_version field. ` +
          `Expected "${spec.current_schema_version}".`,
      );
    }
    if (dataObj.schema_version !== spec.current_schema_version) {
      throw new InvalidArtifactError(
        `${kind}: data has schema_version "${dataObj.schema_version}" ` +
          `but spec current is "${spec.current_schema_version}".`,
      );
    }

    const content = spec.serialize(data, format);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, "utf8");
  }

  /**
   * Append-only logs (e.g. emergency-log.jsonl, prune-log.jsonl) need a
   * separate write entry point because they bypass the "single-data-object
   * with schema_version" pattern. Spec.serialize is invoked per-entry; the
   * caller is responsible for newline framing.
   */
  appendToFile<T>(kind: string, filePath: string, entry: T): void {
    this.ensureInitialized();
    const spec = this.get<T>(kind);

    const validation = spec.validate(entry);
    if (!validation.valid) {
      throw new InvalidArtifactError(
        `${kind} validation failed: ${validation.errors.join(", ")}`,
      );
    }

    const dataObj = entry as { schema_version?: string };
    if (dataObj.schema_version === undefined) {
      throw new InvalidArtifactError(
        `${kind}: entry missing required schema_version field.`,
      );
    }
    if (dataObj.schema_version !== spec.current_schema_version) {
      throw new InvalidArtifactError(
        `${kind}: entry has schema_version "${dataObj.schema_version}" ` +
          `but spec current is "${spec.current_schema_version}".`,
      );
    }

    const format = formatFromPath(filePath, kind, spec);
    const line = spec.serialize(entry, format) + "\n";

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(filePath, line, "utf8");
  }

  listRegistered(): string[] {
    this.ensureInitialized();
    return [...this.specs.keys()].sort();
  }

  /** Test-only reset. Not used in production code paths. */
  __resetForTest(): void {
    this.specs.clear();
    this.initialized = false;
    this.cachedInitError = null;
  }
}

function formatFromPath(
  filePath: string,
  kind: string,
  spec: ArtifactSpec,
): ArtifactFormat {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  let format: ArtifactFormat;
  if (ext === "json" || ext === "jsonl") {
    format = "json";
  } else if (ext === "yaml" || ext === "yml") {
    format = "yaml";
  } else {
    throw new Error(
      `${kind}: unsupported file extension ".${ext}" (path=${filePath})`,
    );
  }
  if (!spec.supported_formats.includes(format)) {
    throw new Error(
      `${kind}: format ${format} (from ${filePath}) not in supported_formats ` +
        `[${spec.supported_formats.join(", ")}]`,
    );
  }
  return format;
}

/** Singleton instance. */
export const REGISTRY = new ArtifactRegistry();
