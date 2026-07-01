/*
 * Graceful-terminal signal-rethrow structure guard (design §16.4, N5').
 *
 * A GracefulTerminalSignal is thrown deep inside runReconstruct and must reach the run-level catch
 * that assembles the honest blocked/limited terminal. Any intermediate catch that SWALLOWS or WRAPS
 * the error (a degrade, a retry, a telemetry sink) would absorb the signal and turn an honest
 * terminal into a crash or a degraded result. To keep that impossible as new sites are added, this
 * guard inventories EVERY catch clause in run.ts and requires each one to either:
 *   - be a provably-unconditional-direct-rethrow (`catch (e) { throw e; }`, no branches), OR
 *   - make its FIRST statement `if (isGracefulTerminalSignal(<e>)) throw <e>;` (rethrow guard) or
 *     `if (isGracefulTerminalSignal(<e>)) return …;` (the run-level handler).
 *
 * The check is syntactic and conservative (a fail-closed decision): it does not reason about whether
 * a given catch could actually observe the signal — an un-guarded catch is a violation regardless.
 * Uses the TypeScript AST so catch detection is exact (not regex-fragile). Non-zero exit on any
 * violation; also fails if zero catches are found (a vacuous pass proves nothing). npm:
 * `check:graceful-signal-rethrow`.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const RUN_TS = path.join(PROJECT_ROOT, "src/core-runtime/reconstruct/run.ts");
const GUARD_FN = "isGracefulTerminalSignal";

type Status = "guarded" | "handler" | "exempt-rethrow" | "VIOLATION";
interface Finding {
  line: number;
  varName: string;
  status: Status;
  detail: string;
}

const source = fs.readFileSync(RUN_TS, "utf8");
const sf = ts.createSourceFile(RUN_TS, source, ts.ScriptTarget.Latest, true);

const HANDLER_FN = "assembleGracefulTerminal";

/** True when `stmt` is `throw <varName>;` (a bare rethrow of the caught error). */
function isBareRethrow(stmt: ts.Statement, varName: string): boolean {
  return (
    ts.isThrowStatement(stmt) &&
    !!stmt.expression &&
    ts.isIdentifier(stmt.expression) &&
    stmt.expression.text === varName
  );
}

/** True when `expr` is `[await] assembleGracefulTerminal(...)` — the ONLY sanctioned handler form. */
function isHandlerReturn(expr: ts.Expression | undefined): boolean {
  if (!expr) return false;
  const call = ts.isAwaitExpression(expr) ? expr.expression : expr;
  return (
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === HANDLER_FN
  );
}

/**
 * True when `node` routes the signal to the sanctioned handler: it contains a
 * `return [await] assembleGracefulTerminal(…)` and NO return of any other value (a non-handler
 * return would be a swallow). Walks nested blocks / try-catch (the run-level handler wraps the
 * assembly call in a try that marks-failed-and-rethrows on a genuine crash).
 */
function routesToHandler(node: ts.Node): boolean {
  let sawHandlerReturn = false;
  let sawForeignReturn = false;
  const walk = (n: ts.Node): void => {
    if (ts.isReturnStatement(n)) {
      if (isHandlerReturn(n.expression)) sawHandlerReturn = true;
      else sawForeignReturn = true;
    }
    // Do not descend into nested function/closure bodies — their returns are not this catch's.
    if (
      ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
    ) {
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return sawHandlerReturn && !sawForeignReturn;
}

/**
 * Classifies the catch's first statement as a graceful guard:
 *   `if (isGracefulTerminalSignal(<varName>)) throw <varName>;`                  → "guard"
 *   `if (isGracefulTerminalSignal(<varName>)) return [await] assembleGracefulTerminal(…);` → "handler"
 * A return of anything OTHER than assembleGracefulTerminal(…) is NOT a handler — it would swallow the
 * signal into a degraded result — so it falls through to null → VIOLATION (design §16.4 N5').
 */
function classifyFirstStatement(
  stmt: ts.Statement,
  varName: string,
): "guard" | "handler" | null {
  if (!ts.isIfStatement(stmt)) return null;
  const cond = stmt.expression;
  if (!ts.isCallExpression(cond)) return null;
  if (!ts.isIdentifier(cond.expression) || cond.expression.text !== GUARD_FN) {
    return null;
  }
  if (cond.arguments.length !== 1) return null;
  const arg = cond.arguments[0];
  if (!arg || !ts.isIdentifier(arg) || arg.text !== varName) return null;
  const then = stmt.thenStatement;
  const inner = ts.isBlock(then)
    ? (then.statements.length === 1 ? then.statements[0]! : then)
    : then;
  if (isBareRethrow(inner, varName)) return "guard";
  if (ts.isReturnStatement(inner) && isHandlerReturn(inner.expression)) return "handler";
  // The run-level handler wraps `return assembleGracefulTerminal(e)` in a try/catch (mark-failed +
  // rethrow on a genuine assembly crash); accept a then-clause that routes to the handler and never
  // returns any other value.
  if (routesToHandler(inner)) return "handler";
  return null;
}

const findings: Finding[] = [];

function visit(node: ts.Node): void {
  if (ts.isCatchClause(node)) {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const decl = node.variableDeclaration;
    const varName =
      decl && ts.isIdentifier(decl.name) ? decl.name.text : null;
    const stmts = node.block.statements;
    if (!varName) {
      findings.push({
        line,
        varName: "(unbound)",
        status: "VIOLATION",
        detail: "catch without a bound error variable cannot rethrow a graceful signal",
      });
    } else if (stmts.length === 1 && stmts[0] && isBareRethrow(stmts[0], varName)) {
      findings.push({
        line,
        varName,
        status: "exempt-rethrow",
        detail: "unconditional direct rethrow (no branches)",
      });
    } else {
      const first = stmts[0];
      const kind = first ? classifyFirstStatement(first, varName) : null;
      if (kind === "guard") {
        findings.push({ line, varName, status: "guarded", detail: "first statement rethrows the graceful signal" });
      } else if (kind === "handler") {
        findings.push({ line, varName, status: "handler", detail: "first statement handles the graceful signal" });
      } else {
        findings.push({
          line,
          varName,
          status: "VIOLATION",
          detail: `first statement is not \`if (${GUARD_FN}(${varName})) throw/return\` and the catch is not an unconditional rethrow`,
        });
      }
    }
  }
  ts.forEachChild(node, visit);
}

visit(sf);

console.log(
  `check-graceful-signal-rethrow: ${findings.length} catch clause(s) in src/core-runtime/reconstruct/run.ts`,
);
for (const f of findings) {
  console.log(`  L${f.line} catch(${f.varName}): ${f.status} — ${f.detail}`);
}

if (findings.length === 0) {
  console.error(
    "\nERROR: no catch clauses found in run.ts — the guard subject set is empty (a vacuous pass proves nothing).",
  );
  process.exit(1);
}

const violations = findings.filter((f) => f.status === "VIOLATION");
if (violations.length > 0) {
  console.error(
    `\n${violations.length} VIOLATION(s): every non-trivial catch in run.ts must rethrow a graceful terminal signal at the top ` +
      `(\`if (${GUARD_FN}(e)) throw e;\`) so it cannot be swallowed. See design §16.4 (N5').`,
  );
  process.exit(1);
}

console.log(
  `\nOK — all ${findings.length} catch clauses guard or handle the graceful terminal signal.`,
);
