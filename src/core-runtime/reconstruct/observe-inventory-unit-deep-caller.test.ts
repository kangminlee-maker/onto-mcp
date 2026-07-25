import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Gate-ordering substrate check (Core Stage 2 inter-document breadth design
 * 20260722-inter-document-breadth-stage2 §5/§6/§13 PR-2a): `expandSourceObservationIntoRegions`
 * (the Stage 1 decomposition fan-out) must have EXACTLY ONE caller — `observeInventoryUnitDeep`
 * — across the reconstruct module. PR-2b's admission-selection stage relies on this as a
 * CALL-GRAPH property, not a runtime check: an unselected/deferred unit that never reaches
 * `observeInventoryUnitDeep` can then never reach the decomposition fan-out either, so a future
 * flag-ordering mistake cannot silently decompose-all. This is a STATIC AST check (robust to
 * reformatting — same idiom as scripts/check-graceful-signal-rethrow.ts and this module's sibling
 * gate source-region-key-coverage.test.ts): scan every non-test source file in this directory for
 * call expressions naming `expandSourceObservationIntoRegions`, and assert the total is exactly
 * 1 AND that one call site sits inside `observeInventoryUnitDeep`'s function body.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CALLEE_NAME = "expandSourceObservationIntoRegions";
const EXPECTED_CALLER_NAME = "observeInventoryUnitDeep";
const MATERIALIZE_TS = path.join(HERE, "materialize-preparation.ts");

function sourceFile(filePath: string): ts.SourceFile {
  const text = fs.readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
}

/** Every non-test .ts source file directly in this (flat) directory. */
function reconstructModuleSourceFiles(): string[] {
  return fs
    .readdirSync(HERE)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => path.join(HERE, name));
}

/** All call-expression nodes anywhere in `sf` that invoke the bare identifier `CALLEE_NAME`. */
function findCallSites(sf: ts.SourceFile): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === CALLEE_NAME) {
      found.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** Find a top-level (possibly exported, possibly async) function DECLARATION by name. */
function findFunctionByName(sf: ts.SourceFile, name: string): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) {
    throw new Error(
      `Gate-ordering site drifted: function '${name}' not found in ${sf.fileName} — re-cite the site (design 20260722-inter-document-breadth-stage2 §5) rather than loosening this gate.`,
    );
  }
  return found;
}

describe(`${CALLEE_NAME} has exactly one caller (design 20260722-inter-document-breadth-stage2 §6 gate-ordering)`, () => {
  it("the reconstruct module source file list is non-empty (non-vacuous scan)", () => {
    expect(reconstructModuleSourceFiles().length).toBeGreaterThan(0);
  });

  it(`${CALLEE_NAME} is declared exactly where expected (materialize-preparation.ts)`, () => {
    const sf = sourceFile(MATERIALIZE_TS);
    let declared = 0;
    const visit = (n: ts.Node): void => {
      if (ts.isFunctionDeclaration(n) && n.name?.text === CALLEE_NAME) declared += 1;
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(declared).toBe(1);
  });

  it(`exactly one call site exists across the whole module, and it is inside ${EXPECTED_CALLER_NAME}`, () => {
    const files = reconstructModuleSourceFiles();
    const allCallSites: Array<{ file: string; sf: ts.SourceFile; node: ts.CallExpression }> = [];
    for (const file of files) {
      const sf = sourceFile(file);
      for (const node of findCallSites(sf)) {
        allCallSites.push({ file, sf, node });
      }
    }
    expect(allCallSites.length).toBe(1);

    const { file, sf, node } = allCallSites[0]!;
    expect(file).toBe(MATERIALIZE_TS);

    // Reuse the SAME parsed SourceFile the call site came from — findFunctionByName walks it to
    // locate observeInventoryUnitDeep's span, so the position comparison below is over one
    // consistent AST instance rather than two independent parses of the same text.
    const helperFn = findFunctionByName(sf, EXPECTED_CALLER_NAME);
    // The single call site's position must fall within the helper function's own text span —
    // i.e. it is lexically nested inside observeInventoryUnitDeep, not merely present somewhere
    // else in the same file.
    expect(node.getStart(sf)).toBeGreaterThanOrEqual(helperFn.getStart(sf));
    expect(node.getEnd()).toBeLessThanOrEqual(helperFn.getEnd());
  });
});
