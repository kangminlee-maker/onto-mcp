/**
 * Reads the tail of a tree node's authored output / running log (the node's
 * `outputPath`) for the drill-down detail pane. Read-only; returns [] when the
 * path is absent or unreadable.
 *
 * The detail pane re-reads on every poll tick for a running node whose
 * `.running.log` keeps growing, so this reads only a bounded suffix from the end
 * of the file (not the whole file) to keep cost independent of file size.
 */
import fs from "node:fs/promises";

/** Bytes read from the end of the file — ample for `maxLines` of tail. */
const TAIL_BYTES_CAP = 64 * 1024;

export async function readOutputTail(
  outputPath: string | null | undefined,
  maxLines = 12,
): Promise<string[]> {
  if (!outputPath) return [];
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(outputPath, "r");
    const { size } = await handle.stat();
    const start = size > TAIL_BYTES_CAP ? size - TAIL_BYTES_CAP : 0;
    const length = size - start;
    if (length <= 0) return [];
    const buffer = Buffer.alloc(length);
    // Decode only the bytes actually read (a short read must not leave the
    // zero-filled remainder of the buffer in the decoded text).
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    let text = buffer.toString("utf8", 0, bytesRead);
    // When we started mid-file, drop the leading partial line.
    if (start > 0) {
      const newline = text.indexOf("\n");
      text = newline >= 0 ? text.slice(newline + 1) : "";
    }
    return text.split("\n").filter((line) => line.length > 0).slice(-maxLines);
  } catch {
    return [];
  } finally {
    await handle?.close();
  }
}
