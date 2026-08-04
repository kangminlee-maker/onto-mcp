import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";

/**
 * Atomic artifact writes shared across the review and reconstruct runtimes.
 *
 * Pipeline artifacts (canonical `source-observations.yaml`, validation
 * artifacts, the review record) are rewritten every round and trusted on read.
 * A plain `mkdir` + `writeFile` is not atomic: a crash or full disk mid-write
 * leaves a truncated-but-parseable file that the YAML parser silently accepts
 * (a half-written `validation_status: valid` reads as a clean pass; an empty
 * file reads as `null`). Writing to a same-directory temp file and renaming it
 * into place makes the final path flip atomically — readers see either the
 * prior complete file or the new complete file, never a torn one.
 */

// Process-monotonic counter guarantees temp-path uniqueness even when the same
// target path is rewritten concurrently within one process.
let tempWriteCounter = 0;

/**
 * Write `contents` to `filePath` atomically: create parent dirs, write to a
 * unique same-directory temp file, then rename it into place. On any failure
 * the temp file is removed and no partial file is left at `filePath`.
 */
export async function atomicWriteFile(
  filePath: string,
  contents: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  tempWriteCounter += 1;
  const tempPath = `${filePath}.${process.pid}.${tempWriteCounter}.tmp`;
  try {
    await fs.writeFile(tempPath, contents, "utf8");
    // Same-filesystem rename is atomic; the target flips in one step.
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

async function fsyncDirectory(directoryPath: string): Promise<void> {
  const handle = await fs.open(directoryPath, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Atomic write with crash-durable file and directory metadata. Use for small
 * control-plane authorities whose rename must survive a process or host crash.
 */
export async function durableAtomicWriteFile(
  filePath: string,
  contents: string,
): Promise<void> {
  const directoryPath = path.dirname(filePath);
  await fs.mkdir(directoryPath, { recursive: true });
  tempWriteCounter += 1;
  const tempPath = `${filePath}.${process.pid}.${tempWriteCounter}.durable.tmp`;
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(
      tempPath,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY |
        fsConstants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, filePath);
    await fsyncDirectory(directoryPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

/**
 * Fields stamped on in-memory artifacts for same-process consumers but NEVER persisted. Persisting one
 * changes the on-disk bytes, which feeds reuse-provenance: the scout-pack snapshot hashes the raw
 * validation-file bytes via `sha256File`, so a persisted field rotates that snapshot (the
 * `reuseMatchArtifactHash` in-memory digest is neutralized separately, in run.ts
 * `stripVolatileArtifactFields`). The only such field today is the G(a) obligation-coverage telemetry
 * (`asserted_obligation_ids`): validators stamp it and the coverage harvest reads it off the in-memory
 * return value — no consumer reads it from disk. Keeping it out of persistence lets the reuse-hashed /
 * scout-captured validators be instrumented with zero hash rotation and no resume migration.
 */
const IN_MEMORY_ONLY_ARTIFACT_FIELDS: readonly string[] = ["asserted_obligation_ids"];

/**
 * Return `value` with any in-memory-only telemetry fields dropped from the top level. Top-level only by
 * design: validation artifacts carry these fields at top level and the reuse channels only hash
 * standalone validation files, so a recursive walk would add an O(size) cost on every large artifact
 * write (e.g. a 190K-row workbook inventory) for no benefit. Returns the input unchanged (no copy) when
 * no such field is present — the common case for every non-validation artifact.
 */
export function stripInMemoryOnlyArtifactFields(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!IN_MEMORY_ONLY_ARTIFACT_FIELDS.some((key) => key in record)) return value;
  const persisted: Record<string, unknown> = { ...record };
  for (const key of IN_MEMORY_ONLY_ARTIFACT_FIELDS) delete persisted[key];
  return persisted;
}

/**
 * Serialize `value` to YAML and write it atomically, dropping in-memory-only telemetry fields
 * (see `stripInMemoryOnlyArtifactFields`). Byte-for-byte identical to a direct `stringifyYaml(value)`
 * write for any value without those fields — only the write mechanism (and the telemetry omission)
 * changes.
 */
export async function atomicWriteYamlDocument(
  filePath: string,
  value: unknown,
): Promise<void> {
  await atomicWriteFile(
    filePath,
    stringifyYaml(stripInMemoryOnlyArtifactFields(value)),
  );
}

export async function durableAtomicWriteYamlDocument(
  filePath: string,
  value: unknown,
): Promise<void> {
  await durableAtomicWriteFile(
    filePath,
    stringifyYaml(stripInMemoryOnlyArtifactFields(value)),
  );
}

/**
 * Fail-closed shape guard for trusted artifact reads. The pipeline reads its
 * own artifacts and trusts them on read; a malformed artifact (e.g. a required
 * array field that is missing, null, or a scalar — from a torn write or
 * out-of-band tampering) would otherwise crash deep inside a validator with an
 * uncontextualized `TypeError: ... is not iterable`. This throws an integrity
 * error that names the artifact and field instead, so the run halts with an
 * actionable message rather than continuing on misread data.
 */
export function assertArrayField(
  value: unknown,
  artifactLabel: string,
  fieldName: string,
): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `artifact integrity: ${artifactLabel} field '${fieldName}' must be an array, got ${
        value === null ? "null" : typeof value
      }`,
    );
  }
}
