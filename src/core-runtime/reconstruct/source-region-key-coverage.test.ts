import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Exhaustiveness gate for Bucket A observation-coverage/dedup sites (Stage 1
 * source-region-decomposition design 20260722 §5, PR-1a). Every coverage/dedup
 * Set or Map keyed on a source_ref must derive its key via the single
 * `regionKey`/`regionCoverageKeys` derivation path (source-observations.ts) —
 * never a bare `path.resolve(source_ref)` — so a future site can never
 * silently re-introduce the "did I miss a site?" failure mode the design calls
 * the highest-value safety mechanism. This is a STATIC AST check (robust to
 * reformatting, unlike a text/regex scan — same idiom as
 * scripts/check-graceful-signal-rethrow.ts): for each named Bucket A function,
 * walk its body and assert at least one call to `regionKey(...)` or
 * `regionCoverageKeys(...)` (the query side calls the former directly; the
 * observation/inventory-unit — authoritative — side calls the latter, which
 * itself calls regionKey internally for both the file-level and precise forms
 * — see regionCoverageKeys' doc comment).
 *
 * Excluded on purpose: A6 `normalizeFrontierForDelta` (source-observation-
 * delta-validation.ts) threads `location` through to A5's regionKey call but
 * does not itself build a coverage Set/Map — it is covered by the regionKey
 * region-readiness tests in source-observation-delta-validation.test.ts. A8-A10
 * (buildInventoryUnits/buildInitialSourceFrontier/stableFrontierRefId,
 * materialize-preparation.ts) are inventory/frontier-id BUILDERS, not
 * observation-coverage/dedup structures — A9's conditional location fold is
 * covered by its own unit test.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN_TS = path.join(HERE, "run.ts");
const ADMISSION_TS = path.join(HERE, "source-admission-selection-stage.ts");
const DELTA_TS = path.join(HERE, "source-observation-delta-validation.ts");
const MATURATION_TS = path.join(HERE, "maturation-validation.ts");

const REGION_KEY_FN_NAMES = new Set(["regionKey", "regionCoverageKeys"]);

function sourceFile(filePath: string): ts.SourceFile {
  const text = fs.readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
}

/** Find a top-level (possibly exported) function DECLARATION by name. */
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
      `Bucket A site drifted: function '${name}' not found in ${sf.fileName} — re-cite the site (design 20260722 §5) rather than loosening this gate.`,
    );
  }
  return found;
}

/** True when `node`'s subtree contains at least one call to regionKey(...) or regionCoverageKeys(...). */
function callsRegionKeyDerivation(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      REGION_KEY_FN_NAMES.has(n.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

// Bucket A coverage/dedup sites (design §5) — each MUST route its key through
// regionKey/regionCoverageKeys.
const BUCKET_A_SITES: ReadonlyArray<{ file: string; fn: string; label: string }> = [
  { file: ADMISSION_TS, fn: "validateSourceFrontier", label: "A1" },
  { file: ADMISSION_TS, fn: "observeAcceptedFrontierRefs", label: "A2" },
  { file: RUN_TS, fn: "observeAcceptedMaturationClosureSourceRequests", label: "A3" },
  { file: DELTA_TS, fn: "observationsBySourceRef", label: "A4" },
  { file: DELTA_TS, fn: "buildSourceObservationDeltaArtifact", label: "A5" },
  { file: MATURATION_TS, fn: "validateMaturationClosureFrontier", label: "A7" },
];

describe("Bucket A regionKey exhaustiveness gate (design 20260722 §5)", () => {
  it("BUCKET_A_SITES enumerates a non-empty, real site list", () => {
    // A vacuous pass proves nothing (verification-discipline guard): fail loud if the list is ever
    // emptied out instead of silently gating on 0 sites.
    expect(BUCKET_A_SITES.length).toBeGreaterThan(0);
  });

  for (const site of BUCKET_A_SITES) {
    it(`${site.label} ${site.fn} derives its coverage/dedup key via regionKey/regionCoverageKeys`, () => {
      const sf = sourceFile(site.file);
      const fn = findFunctionByName(sf, site.fn);
      expect(callsRegionKeyDerivation(fn)).toBe(true);
    });
  }
});
