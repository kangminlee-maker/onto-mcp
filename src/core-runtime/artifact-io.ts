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

/**
 * Serialize `value` to YAML and write it atomically. Byte-for-byte identical
 * output to a direct `stringifyYaml(value)` write — only the write mechanism
 * changes.
 */
export async function atomicWriteYamlDocument(
  filePath: string,
  value: unknown,
): Promise<void> {
  await atomicWriteFile(filePath, stringifyYaml(value));
}
