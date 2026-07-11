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
const LEAF_READER_TS = path.join(
  PROJECT_ROOT,
  "src/core-runtime/reconstruct/leaf-reader.ts",
);
const GUARD_FN = "isGracefulTerminalSignal";
const LLM_FAILURE_GUARD_FN = "readReconstructLlmDispatchFailureError";

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

function isNamedGuardRethrow(
  stmt: ts.Statement | undefined,
  varName: string,
  guardFn: string,
): boolean {
  if (!stmt || !ts.isIfStatement(stmt)) return false;
  const cond = stmt.expression;
  if (
    !ts.isCallExpression(cond) ||
    !ts.isIdentifier(cond.expression) ||
    cond.expression.text !== guardFn ||
    cond.arguments.length !== 1
  ) {
    return false;
  }
  const arg = cond.arguments[0];
  if (!arg || !ts.isIdentifier(arg) || arg.text !== varName) return false;
  const then = stmt.thenStatement;
  const inner = ts.isBlock(then) && then.statements.length === 1
    ? then.statements[0]
    : then;
  return Boolean(inner && isBareRethrow(inner, varName));
}

function isRunTypedFailureHandler(
  statements: ts.NodeArray<ts.Statement>,
  caughtVarName: string,
): boolean {
  const isTypedFailureDeclaration = (statement: ts.Statement): boolean => {
    if (
      !ts.isVariableStatement(statement) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const) ||
      statement.declarationList.declarations.length !== 1
    ) {
      return false;
    }
    const declaration = statement.declarationList.declarations[0];
    if (
      !declaration ||
      !ts.isIdentifier(declaration.name) ||
      !declaration.initializer ||
      !ts.isCallExpression(declaration.initializer) ||
      !ts.isIdentifier(declaration.initializer.expression) ||
      declaration.initializer.expression.text !== LLM_FAILURE_GUARD_FN ||
      declaration.initializer.arguments.length !== 1
    ) {
      return false;
    }
    const argument = declaration.initializer.arguments[0];
    return Boolean(
      argument &&
      ts.isIdentifier(argument) &&
      argument.text === caughtVarName,
    );
  };
  const declarationIndexes = statements.flatMap((statement, index) =>
    isTypedFailureDeclaration(statement) ? [index] : []
  );
  if (declarationIndexes.length !== 1 || declarationIndexes[0] !== 1) {
    return false;
  }
  const declarationIndex = declarationIndexes[0];
  const declarationStatement = statements[declarationIndex];
  if (!declarationStatement || !ts.isVariableStatement(declarationStatement)) {
    return false;
  }
  const declaration = declarationStatement.declarationList.declarations[0];
  if (!declaration || !ts.isIdentifier(declaration.name)) return false;
  const typedFailureVarName = declaration.name.text;

  const typedBranch = statements[declarationIndex + 1];
  if (
    !typedBranch ||
    !ts.isIfStatement(typedBranch) ||
    typedBranch.elseStatement ||
    !ts.isIdentifier(typedBranch.expression) ||
    typedBranch.expression.text !== typedFailureVarName ||
    !ts.isBlock(typedBranch.thenStatement) ||
    typedBranch.thenStatement.statements.length !== 2
  ) {
    return false;
  }
  const persistenceTry = typedBranch.thenStatement.statements[0];
  const terminalRethrow = typedBranch.thenStatement.statements[1];
  if (
    !persistenceTry ||
    !ts.isTryStatement(persistenceTry) ||
    persistenceTry.finallyBlock ||
    persistenceTry.tryBlock.statements.length !== 1 ||
    !terminalRethrow ||
    !isBareRethrow(terminalRethrow, caughtVarName)
  ) {
    return false;
  }
  let persistenceReferenceCount = 0;
  const countPersistenceReferences = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      node.text === "persistReconstructLlmDispatchFailure"
    ) {
      persistenceReferenceCount += 1;
    }
    ts.forEachChild(node, countPersistenceReferences);
  };
  for (const statement of statements) countPersistenceReferences(statement);
  if (persistenceReferenceCount !== 1) return false;

  const persistenceStatement = persistenceTry.tryBlock.statements[0];
  if (!persistenceStatement || !ts.isExpressionStatement(persistenceStatement)) {
    return false;
  }
  const awaited = persistenceStatement.expression;
  if (!ts.isAwaitExpression(awaited) || !ts.isCallExpression(awaited.expression)) {
    return false;
  }
  const call = awaited.expression;
  if (
    !ts.isIdentifier(call.expression) ||
    call.expression.text !== "persistReconstructLlmDispatchFailure" ||
    call.arguments.length !== 1
  ) {
    return false;
  }
  const options = call.arguments[0];
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  if (
    options.properties.some((property) =>
      ts.isSpreadAssignment(property) ||
      ("name" in property && ts.isComputedPropertyName(property.name))
    )
  ) {
    return false;
  }
  const errorProperties = options.properties.filter((property) => {
    if (!("name" in property)) return false;
    return (
      (ts.isIdentifier(property.name) && property.name.text === "error") ||
      (ts.isStringLiteral(property.name) && property.name.text === "error")
    );
  });
  const errorProperty = errorProperties[0];
  return Boolean(
    errorProperties.length === 1 &&
    errorProperty &&
    ts.isPropertyAssignment(errorProperty) &&
    ts.isIdentifier(errorProperty.initializer) &&
    errorProperty.initializer.text === typedFailureVarName,
  );
}

function typedHandlerStatements(sourceText: string): ts.NodeArray<ts.Statement> {
  const fixture = ts.createSourceFile(
    "g11-typed-handler-fixture.ts",
    `async function fixture() { try {} catch (error) { ${sourceText} } }`,
    ts.ScriptTarget.Latest,
    true,
  );
  let statements: ts.NodeArray<ts.Statement> | null = null;
  const visitFixture = (node: ts.Node): void => {
    if (ts.isCatchClause(node) && statements === null) {
      statements = node.block.statements;
    }
    ts.forEachChild(node, visitFixture);
  };
  visitFixture(fixture);
  if (!statements) throw new Error("G11 typed-handler self-check fixture did not parse");
  return statements;
}

const VALID_TYPED_HANDLER_FIXTURE = `
  if (isGracefulTerminalSignal(error)) return assembleGracefulTerminal(error);
  const typed = readReconstructLlmDispatchFailureError(error);
  if (typed) {
    try {
      await persistReconstructLlmDispatchFailure({ error: typed });
    } catch (persistenceError) {
      throw persistenceError;
    }
    throw error;
  }
`;
const INVALID_TYPED_HANDLER_FIXTURES = [
  VALID_TYPED_HANDLER_FIXTURE.replace("const typed", "let typed"),
  VALID_TYPED_HANDLER_FIXTURE.replace(
    "if (typed) {",
    "typed = null; if (typed) {",
  ),
  VALID_TYPED_HANDLER_FIXTURE.replace(
    "await persistReconstructLlmDispatchFailure",
    "void persistReconstructLlmDispatchFailure",
  ),
  VALID_TYPED_HANDLER_FIXTURE.replace(
    "await persistReconstructLlmDispatchFailure({ error: typed });",
    "if (false) await persistReconstructLlmDispatchFailure({ error: typed });",
  ),
  VALID_TYPED_HANDLER_FIXTURE.replace("{ error: typed }", "{ error }"),
  VALID_TYPED_HANDLER_FIXTURE.replace("throw error;", "throw typed;"),
  VALID_TYPED_HANDLER_FIXTURE.replace(
    "throw error;",
    "if (false) throw error; throw new Error('replacement');",
  ),
  `return; ${VALID_TYPED_HANDLER_FIXTURE}`,
  `${VALID_TYPED_HANDLER_FIXTURE}
   const duplicateTyped = readReconstructLlmDispatchFailureError(error);`,
  VALID_TYPED_HANDLER_FIXTURE.replace(
    "} catch (persistenceError) {\n      throw persistenceError;\n    }",
    "} finally {\n      throw new Error('replacement');\n    }",
  ),
  VALID_TYPED_HANDLER_FIXTURE.replace(
    "{ error: typed }",
    "{ error: typed, ...({ error } as any) }",
  ),
  VALID_TYPED_HANDLER_FIXTURE.replace(
    "{ error: typed }",
    "{ error: typed, ['error']: error }",
  ),
  VALID_TYPED_HANDLER_FIXTURE.replace(
    "throw persistenceError;",
    "await persistReconstructLlmDispatchFailure({ error: typed }); throw persistenceError;",
  ),
  VALID_TYPED_HANDLER_FIXTURE.replace(
    "{ error: typed }",
    "{ audit: await persistReconstructLlmDispatchFailure({ error: typed }), error: typed }",
  ),
];
const validTypedHandlerAccepted = isRunTypedFailureHandler(
  typedHandlerStatements(VALID_TYPED_HANDLER_FIXTURE),
  "error",
);
const invalidTypedHandlerAccepted = INVALID_TYPED_HANDLER_FIXTURES.map(
  (fixture) => isRunTypedFailureHandler(typedHandlerStatements(fixture), "error"),
);
if (
  !validTypedHandlerAccepted ||
  invalidTypedHandlerAccepted.some(Boolean)
) {
  throw new Error(
    `G11 typed-handler contrast self-check failed: valid=${validTypedHandlerAccepted} ` +
      `invalid=${JSON.stringify(invalidTypedHandlerAccepted)}`,
  );
}

const findings: Finding[] = [];
let runCatchCount = 0;
let runHandlerCount = 0;

function visit(node: ts.Node): void {
  if (ts.isCatchClause(node)) {
    runCatchCount += 1;
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
        if (!isNamedGuardRethrow(stmts[1], varName, LLM_FAILURE_GUARD_FN)) {
          findings.push({
            line,
            varName,
            status: "VIOLATION",
            detail:
              `second statement must rethrow ${LLM_FAILURE_GUARD_FN}(${varName}) so provider partial output cannot be degraded`,
          });
        } else {
          findings.push({
            line,
            varName,
            status: "guarded",
            detail: "first two statements rethrow graceful and provider-output terminal signals",
          });
        }
      } else if (kind === "handler") {
        if (!isRunTypedFailureHandler(stmts, varName)) {
          findings.push({
            line,
            varName,
            status: "VIOLATION",
            detail:
              "run-level handler must detect the caught provider-output terminal, await its failure persistence, and rethrow the same caught error",
          });
        } else {
          runHandlerCount += 1;
          findings.push({
            line,
            varName,
            status: "handler",
            detail:
              "handles graceful terminal and persists/rethrows the caught provider-output terminal",
          });
        }
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

const leafSource = fs.readFileSync(LEAF_READER_TS, "utf8");
const leafSf = ts.createSourceFile(
  LEAF_READER_TS,
  leafSource,
  ts.ScriptTarget.Latest,
  true,
);
let leafProviderCatchCount = 0;
function containsCallTo(node: ts.Node, identifier: string): boolean {
  let found = false;
  const walk = (current: ts.Node): void => {
    if (found) return;
    if (
      current !== node &&
      (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current))
    ) {
      return;
    }
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === identifier
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, walk);
  };
  walk(node);
  return found;
}
function visitLeaf(node: ts.Node): void {
  if (
    ts.isCatchClause(node) &&
    ts.isTryStatement(node.parent) &&
    containsCallTo(node.parent.tryBlock, "callLlm")
  ) {
    leafProviderCatchCount += 1;
    const decl = node.variableDeclaration;
    const varName = decl && ts.isIdentifier(decl.name) ? decl.name.text : null;
    const line = leafSf.getLineAndCharacterOfPosition(node.getStart(leafSf)).line + 1;
    if (
      varName &&
      isNamedGuardRethrow(
        node.block.statements[0],
        varName,
        LLM_FAILURE_GUARD_FN,
      )
    ) {
      findings.push({
        line,
        varName,
        status: "guarded",
        detail: "leaf-reader LLM catch rethrows provider-output terminal signals",
      });
    } else {
      findings.push({
        line,
        varName: varName ?? "(unbound)",
        status: "VIOLATION",
        detail:
          `leaf-reader catch must first rethrow ${LLM_FAILURE_GUARD_FN}(${varName})`,
      });
    }
  }
  ts.forEachChild(node, visitLeaf);
}
visitLeaf(leafSf);

console.log(
  `check-graceful-signal-rethrow: ${findings.length} guarded catch clause(s) across reconstruct terminal paths`,
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

if (runCatchCount === 0) {
  console.error("\nERROR: run.ts catch subject set is empty.");
  process.exit(1);
}
if (runHandlerCount !== 1) {
  console.error(
    `\nERROR: run.ts must contain exactly one graceful terminal handler catch; observed ${runHandlerCount}.`,
  );
  process.exit(1);
}
if (leafProviderCatchCount !== 1) {
  console.error(
    `\nERROR: leaf-reader.ts must contain exactly one callLlm provider catch; observed ${leafProviderCatchCount}.`,
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
