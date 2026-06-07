import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export function isPathInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function realpathIfExists(targetPath: string): Promise<string | null> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return null;
  }
}

export function realpathIfExistsSync(targetPath: string): string | null {
  try {
    return fsSync.realpathSync(targetPath);
  } catch {
    return null;
  }
}

export async function realpathNearestExisting(targetPath: string): Promise<string | null> {
  let current = path.resolve(targetPath);
  while (true) {
    const real = await realpathIfExists(current);
    if (real) return real;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function isPathInsideRootRealpathAwareSync(
  root: string,
  candidate: string,
): boolean {
  const realRoot = realpathIfExistsSync(root) ?? path.resolve(root);
  const realCandidate = realpathIfExistsSync(candidate) ?? path.resolve(candidate);
  return isPathInsideRoot(realRoot, realCandidate);
}

export async function assertPathInsideRoot(args: {
  root: string;
  candidate: string;
  label: string;
}): Promise<void> {
  const root = path.resolve(args.root);
  const candidate = path.resolve(args.candidate);
  const lexicallyInside = isPathInsideRoot(root, candidate);
  const realRoot = (await realpathIfExists(root)) ?? root;
  const realCandidate = await realpathIfExists(candidate);
  if (realCandidate) {
    if (isPathInsideRoot(realRoot, realCandidate)) return;
    throw new Error(
      lexicallyInside
        ? `${args.label} realpath escapes allowed root: ${realCandidate}`
        : `${args.label} escapes allowed root: ${candidate}`,
    );
  }
  if (!realCandidate) {
    const nearest = await realpathNearestExisting(path.dirname(candidate));
    if (nearest) {
      if (isPathInsideRoot(realRoot, nearest)) return;
      throw new Error(
        lexicallyInside
          ? `${args.label} parent realpath escapes allowed root: ${nearest}`
          : `${args.label} escapes allowed root: ${candidate}`,
      );
    }
  }
  if (!lexicallyInside) {
    throw new Error(`${args.label} escapes allowed root: ${candidate}`);
  }
}
