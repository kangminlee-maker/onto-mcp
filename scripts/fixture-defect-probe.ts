import { transformSync } from "esbuild";
import ts from "typescript";

/**
 * V1 fixture-defect probe harness (review-cert/v3 design §D5). A fixture's
 * review target is a TS-syntax SOURCE BLOB (scripts/review-pipeline-benchmark.ts
 * benchmarkFixture), never a real module on disk — writing the seeded defect as
 * a real module would violate the benchmark's single-source-of-truth invariant.
 * To PROVE a seeded defect is real (not merely asserted in a comment), transpile
 * the self-contained blob and import it in isolation, then execute the defective
 * export. esbuild strips the TS types; a base64 data: URL dynamic import yields a
 * fresh, isolated module graph — no disk write, no shared state between probes.
 *
 * The code fixtures' target blobs are self-contained (no cross-file imports);
 * pass the single target file's source. A blob that imports another file is out
 * of scope for this probe.
 */
export async function transpileEvalModule(
  tsSource: string,
): Promise<Record<string, unknown>> {
  const { code } = transformSync(tsSource, { loader: "ts", format: "esm" });
  const dataUrl =
    "data:text/javascript;base64," +
    Buffer.from(code, "utf8").toString("base64");
  return (await import(dataUrl)) as Record<string, unknown>;
}

export interface FixtureBlobStructure {
  /**
   * Per top-level function declaration, the sorted set of callee names it
   * invokes: a bare local call `rawFormat(x)` is "rawFormat"; a member call
   * `JSON.stringify(x)` is "JSON.stringify"; `inputs.reduce(...)` is
   * "inputs.reduce". Callees present nowhere in a function body simply do not
   * appear.
   */
  callees: Record<string, string[]>;
  /** Exported top-level symbol names (functions, consts, interfaces). */
  exportedSymbols: string[];
}

/**
 * V1 STRUCTURAL-proof support (design §D5), distinct from transpileEvalModule's
 * execution proof. Two fixtures need to prove something the execution layer
 * cannot:
 *
 *   - shared-root: that two DISTINCT surface defects derive from the SAME root
 *     is not one assert — both surface functions must route through one shared
 *     code path, and the independent defect must not. The callee graph shows
 *     unstableFormat→rawFormat and alternateFormat→rawFormat over a single
 *     JSON.stringify carrier, while truncate stays off it.
 *   - clean-target: with zero material defects there is nothing to execute-prove,
 *     so the boundary decoy is checked structurally instead — its symbols exist
 *     (exportedSymbols) and the reviewed core does not reference them (callees),
 *     so no material obligation binds them.
 *
 * Parsing uses the real TypeScript AST (not regex) so the delegation facts are
 * exact — the repo's other structural guards (check-graceful-signal-rethrow.ts)
 * take the same approach.
 *
 * SCOPE: `callees` is computed only for top-level `function` DECLARATIONS. An
 * arrow-const export (`export const f = () => …`) lands in `exportedSymbols` but
 * gets NO `callees` entry — the current fixture blobs use only declarations. A
 * V1 proof over a blob whose reviewed functions are arrows would read an empty
 * callee list, so such proofs must assert EXACT callees (fail loud) rather than
 * `callees.x ?? []` (which would pass vacuously); extend the scanner here if a
 * future fixture needs arrow bodies.
 */
export function fixtureBlobStructure(tsSource: string): FixtureBlobStructure {
  const sf = ts.createSourceFile(
    "fixture-blob.ts",
    tsSource,
    ts.ScriptTarget.Latest,
    true,
  );
  const hasExport = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
  const calleeName = (expr: ts.Expression): string | null => {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr)) {
      const object = ts.isIdentifier(expr.expression)
        ? expr.expression.text
        : "?";
      return `${object}.${expr.name.text}`;
    }
    return null;
  };
  const callees: Record<string, string[]> = {};
  const exportedSymbols: string[] = [];
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      if (hasExport(statement)) exportedSymbols.push(statement.name.text);
      if (statement.body) {
        const found = new Set<string>();
        const visit = (node: ts.Node): void => {
          if (ts.isCallExpression(node)) {
            const name = calleeName(node.expression);
            if (name !== null) found.add(name);
          }
          ts.forEachChild(node, visit);
        };
        visit(statement.body);
        callees[statement.name.text] = [...found].sort();
      }
    } else if (ts.isVariableStatement(statement) && hasExport(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          exportedSymbols.push(declaration.name.text);
        }
      }
    } else if (ts.isInterfaceDeclaration(statement) && hasExport(statement)) {
      exportedSymbols.push(statement.name.text);
    }
  }
  return { callees, exportedSymbols };
}
