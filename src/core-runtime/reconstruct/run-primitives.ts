/**
 * run.ts's file-local generic helpers — a clock, a record guard, canonical JSON ordering, and a
 * content hash. These are NOT a domain concept: this repo's convention is to declare them
 * file-locally (some twenty modules under src/ each have their own copy), and that convention is
 * unchanged elsewhere.
 *
 * They live in one file only because extracting run.ts split their callers across modules, and a
 * shared declaration is the only way to keep the split a byte-identical move rather than a copy.
 * Nothing new should import from here — declare your own, as the neighbouring modules do.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";

export function isoNow(): string {
  return new Date().toISOString();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function sha256File(filePath: string): Promise<string> {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}
