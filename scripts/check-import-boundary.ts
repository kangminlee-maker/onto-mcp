/**
 * G1 — mock/fixture import 경계 + 레이어링 방향 conformance (INV-MOCK-1).
 *
 * 운영 코드(src/** 중 테스트·boundary 제외)에 대해 구조적으로 강제한다:
 *  1. `test-fixtures` boundary import 금지 — mock payload는 테스트에서만 소비.
 *  2. `mock-llm-realization`(semantic_mock realization 모듈) import는 명시적
 *     realization 스위치 지점 allowlist만 허용 — deletion boundary 유지.
 *  3. `src/core-runtime/review/**`(의미층)는 `cli/`(실행층)를 import하지
 *     않는다 — docs/architecture/repo-layout.md 레이어링 규칙.
 *
 * 위반 발견 시 비-0 종료. npm: `check:import-boundary`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SRC_ROOT = path.join(PROJECT_ROOT, "src");

/** semantic_mock realization 스위치로 mock 모듈 import가 허용된 운영 파일. */
const MOCK_REALIZATION_IMPORT_ALLOWLIST = new Set([
  "src/core-runtime/llm/llm-caller.ts",
  "src/core-runtime/llm/llm-tool-loop.ts",
]);

interface Violation {
  file: string;
  line: number;
  importPath: string;
  rule: string;
}

function isTestOrBoundaryFile(relPath: string): boolean {
  return (
    relPath.endsWith(".test.ts") ||
    relPath.includes("/test-fixtures/") ||
    relPath.endsWith("/mock-llm-realization.ts")
  );
}

async function listSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listSourceFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function importPathsOf(source: string): Array<{ line: number; importPath: string }> {
  const results: Array<{ line: number; importPath: string }> = [];
  const lines = source.split("\n");
  // `import "x"` 부수효과 import까지 포함 (from/동적 import/require/측면 import).
  const importRe =
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;
  lines.forEach((text, index) => {
    for (const match of text.matchAll(importRe)) {
      results.push({ line: index + 1, importPath: match[1]! });
    }
  });
  return results;
}

async function main(): Promise<void> {
  const violations: Violation[] = [];
  let scanned = 0;
  for (const file of await listSourceFiles(SRC_ROOT)) {
    const relPath = path.relative(PROJECT_ROOT, file).split(path.sep).join("/");
    if (isTestOrBoundaryFile(relPath)) continue;
    scanned += 1;
    const source = await fs.readFile(file, "utf8");
    for (const { line, importPath } of importPathsOf(source)) {
      if (importPath.includes("test-fixtures")) {
        violations.push({
          file: relPath,
          line,
          importPath,
          rule: "INV-MOCK-1: production code must not import the test-fixtures boundary",
        });
      }
      if (
        importPath.includes("mock-llm-realization") &&
        !MOCK_REALIZATION_IMPORT_ALLOWLIST.has(relPath)
      ) {
        violations.push({
          file: relPath,
          line,
          importPath,
          rule: "INV-MOCK-1: mock-llm-realization may only be imported by the allowlisted realization switch points",
        });
      }
      if (relPath.startsWith("src/core-runtime/review/") && importPath.startsWith(".")) {
        // 깊이와 무관하게 실제 해석 경로가 cli/에 닿는지 본다
        // (예: review/foo/bar.ts의 "../../cli/x.js").
        const resolved = path
          .normalize(path.join(path.dirname(relPath), importPath))
          .split(path.sep)
          .join("/");
        if (resolved.startsWith("src/core-runtime/cli/")) {
          violations.push({
            file: relPath,
            line,
            importPath,
            rule: "repo-layout: review/ (semantic layer) must not import cli/ (execution layer)",
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error("[check:import-boundary] FAIL");
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} imports "${v.importPath}"\n    rule: ${v.rule}`);
    }
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        check: "import-boundary",
        status: "passed",
        scanned_production_files: scanned,
        rules: [
          "no test-fixtures import from production code",
          "mock-llm-realization import only from allowlisted switch points",
          "no review/ -> cli/ import",
        ],
      },
      null,
      2,
    ),
  );
}

await main();
