/**
 * Reads the tail of a tree node's authored output / running log (the node's
 * `outputPath`) for the drill-down detail pane. Read-only; returns [] when the
 * path is absent or unreadable.
 */
import fs from "node:fs/promises";

export async function readOutputTail(
  outputPath: string | null | undefined,
  maxLines = 12,
): Promise<string[]> {
  if (!outputPath) return [];
  try {
    const raw = await fs.readFile(outputPath, "utf8");
    return raw.split("\n").filter((line) => line.length > 0).slice(-maxLines);
  } catch {
    return [];
  }
}
