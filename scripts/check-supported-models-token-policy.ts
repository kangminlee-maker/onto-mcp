import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ts from "typescript";

const execFileAsync = promisify(execFile);

export interface BenchCandidateTokenPolicyFile {
  path: string;
  text: string;
}

export interface BenchCandidateTokenPolicyViolation {
  path: string;
  line: number;
  column: number;
  token: string;
}

const BENCH_CANDIDATE_TOKEN_PATTERN =
  /\b(?:benchCandidate|benchCandidates|BenchCandidate[A-Za-z0-9_]*)\b/g;

const SCANNED_ROOTS = ["src", "scripts", ".onto"] as const;
const SCANNED_ROOT_FILES = ["package.json", "settings.example.json"] as const;
const IGNORED_PREFIXES = ["development-records/", "docs/"] as const;
const IGNORED_ROOT_FILES = new Set(["IMPLEMENTATION_MAP.html"]);

export const BENCH_CANDIDATE_TOKEN_ALLOWED_PATHS = new Set([
  "src/core-runtime/discovery/supported-models.ts",
  "src/core-runtime/discovery/supported-models.test.ts",
  "src/core-runtime/discovery/settings-chain.test.ts",
  "src/core-runtime/discovery/bench-candidate-token-policy.test.ts",
  "src/mcp/tool-surface.test.ts",
  "scripts/b4-live-realization.mts",
  "scripts/check-supported-models.ts",
  "scripts/check-supported-models-token-policy.ts",
]);

export function normalizeRepoRelativePath(input: string): string {
  return input.replaceAll(path.sep, "/").replace(/^\.\//, "");
}

export function isBenchCandidateTokenScannedPath(input: string): boolean {
  const relPath = normalizeRepoRelativePath(input);
  if (IGNORED_ROOT_FILES.has(relPath)) return false;
  if (IGNORED_PREFIXES.some((prefix) => relPath.startsWith(prefix))) {
    return false;
  }
  if ((SCANNED_ROOT_FILES as readonly string[]).includes(relPath)) return true;
  return SCANNED_ROOTS.some(
    (root) => relPath === root || relPath.startsWith(`${root}/`),
  );
}

export function isBenchCandidateTokenAllowedPath(input: string): boolean {
  return BENCH_CANDIDATE_TOKEN_ALLOWED_PATHS.has(normalizeRepoRelativePath(input));
}

export function findBenchCandidateTokenPolicyViolations(
  files: readonly BenchCandidateTokenPolicyFile[],
): BenchCandidateTokenPolicyViolation[] {
  const violations: BenchCandidateTokenPolicyViolation[] = [];
  for (const file of files) {
    const relPath = normalizeRepoRelativePath(file.path);
    if (!isBenchCandidateTokenScannedPath(relPath)) continue;
    const lines = file.text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(BENCH_CANDIDATE_TOKEN_PATTERN)) {
        if (isBenchCandidateTokenAllowedPath(relPath)) continue;
        violations.push({
          path: relPath,
          line: index + 1,
          column: (match.index ?? 0) + 1,
          token: match[0] ?? "",
        });
      }
    }
  }
  return violations;
}

function hasNamedImport(sourceFile: ts.SourceFile, importedName: string): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!statement.moduleSpecifier.text.includes("supported-models")) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    if (
      bindings.elements.some((element) =>
        (element.propertyName ?? element.name).text === importedName
      )
    ) {
      return true;
    }
  }
  return false;
}

function containsArgsCandidatePropertyAccess(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (
      ts.isPropertyAccessExpression(child) &&
      ts.isIdentifier(child.name) &&
      ts.isPropertyAccessExpression(child.expression) &&
      ts.isIdentifier(child.expression.name) &&
      child.expression.name.text === "candidate" &&
      ts.isIdentifier(child.expression.expression) &&
      child.expression.expression.text === "args"
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function findFirstCallStart(
  sourceFile: ts.SourceFile,
  calleeName: string,
  predicate: (node: ts.CallExpression) => boolean = () => true,
): number | undefined {
  let first: number | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === calleeName &&
      predicate(node) &&
      (first === undefined || node.getStart(sourceFile) < first)
    ) {
      first = node.getStart(sourceFile);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return first;
}

export function findB4BenchCandidateHookBindingViolations(
  sourceText: string,
): string[] {
  const sourceFile = ts.createSourceFile(
    "b4-live-realization.mts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations: string[] = [];
  const helperName = "assertB4BenchCandidateDispatchAllowed";
  if (!hasNamedImport(sourceFile, helperName)) {
    violations.push(`${helperName} must be imported from supported-models`);
  }
  const helperCallStart = findFirstCallStart(sourceFile, helperName);
  if (helperCallStart === undefined) {
    violations.push(`${helperName} must be called before candidate config construction`);
  }
  const candidateConfigStart = findFirstCallStart(
    sourceFile,
    "resolveLlmProviderConfig",
    containsArgsCandidatePropertyAccess,
  );
  if (candidateConfigStart === undefined) {
    violations.push("candidate resolveLlmProviderConfig call was not found");
  }
  if (
    helperCallStart !== undefined &&
    candidateConfigStart !== undefined &&
    helperCallStart > candidateConfigStart
  ) {
    violations.push(
      `${helperName} must run before the candidate resolveLlmProviderConfig call`,
    );
  }
  return violations;
}

/** 대상은 **git이 소스로 보는 파일** — 추적 중이거나, 새로 만들었지만 ignore되지
 *  않은 것. `.onto/` 아래에는 실행 세션 산출물(`review/`, `reconstruct/`)과 벤치
 *  작업 영역(`temp/`)이 함께 사는데 그것들은 소스가 아니다. 파일시스템을 그냥
 *  순회하면 그 산출물까지 읽어 이 게이트가 로컬에서 상시 실패한다 — 실제로 그랬다.
 *
 *  git 열거가 실패하면 **던진다.** 조용히 파일시스템 순회로 되돌아가면 그 순간
 *  이 주석이 거짓이 되고, 게이트는 자기가 무엇을 봤는지 모르게 된다. */
async function collectGitSourceFiles(
  repoRoot: string,
  relativeRoots: readonly string[],
): Promise<BenchCandidateTokenPolicyFile[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...relativeRoots],
    { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  const relPaths = [...new Set(stdout.split("\n").filter((line) => line.length > 0))];
  const out: BenchCandidateTokenPolicyFile[] = [];
  for (const relPath of relPaths) {
    let text: string;
    try {
      text = await fs.readFile(path.join(repoRoot, relPath), "utf8");
    } catch {
      // 열거된 뒤 사라진 파일(예: 방금 지운 미추적 파일)은 검사 대상이 아니다.
      continue;
    }
    out.push({ path: normalizeRepoRelativePath(relPath), text });
  }
  return out;
}

export async function collectBenchCandidateTokenPolicyFiles(
  repoRoot: string,
): Promise<BenchCandidateTokenPolicyFile[]> {
  const files: BenchCandidateTokenPolicyFile[] = [
    ...await collectGitSourceFiles(repoRoot, SCANNED_ROOTS),
  ];
  for (const rootFile of SCANNED_ROOT_FILES) {
    const absolutePath = path.join(repoRoot, rootFile);
    try {
      files.push({
        path: rootFile,
        text: await fs.readFile(absolutePath, "utf8"),
      });
    } catch {
      // Optional root files can be absent in an isolated package checkout.
    }
  }
  return files;
}

export async function assertBenchCandidateTokenPolicy(
  repoRoot: string,
): Promise<void> {
  const tokenViolations = findBenchCandidateTokenPolicyViolations(
    await collectBenchCandidateTokenPolicyFiles(repoRoot),
  );
  const b4SourcePath = path.join(repoRoot, "scripts", "b4-live-realization.mts");
  const bindingViolations = findB4BenchCandidateHookBindingViolations(
    await fs.readFile(b4SourcePath, "utf8"),
  );
  const messages = [
    ...tokenViolations.map(
      (violation) =>
        `${violation.path}:${violation.line}:${violation.column} contains ${violation.token}`,
    ),
    ...bindingViolations.map((violation) =>
      `scripts/b4-live-realization.mts: ${violation}`
    ),
  ];
  if (messages.length > 0) {
    throw new Error(
      "benchCandidate tokens may appear only in the B7 runtime/test/harness " +
        "allowlist, and B4 must call the runtime helper before constructing " +
        "the candidate config:\n" + messages.map((m) => `  - ${m}`).join("\n"),
    );
  }
}
