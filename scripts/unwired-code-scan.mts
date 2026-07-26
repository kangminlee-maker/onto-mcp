/**
 * 미배선(unwired) 코드 스캐너 — 제품 진입점에서 **심볼 수준**으로 도달하지 못하는 선언을 센다.
 *
 * "쓰이지 않는 export"를 세는 것과는 다르다. 어떤 심볼이 다른 심볼에서 참조되더라도 그 참조자
 * 자체가 진입점에서 도달 불가면 둘 다 죽은 코드다(전이적 미배선). run.ts의
 * `deterministicOntologySeedTimeoutRecovery` 클러스터가 바로 그 형태였다 — 12심볼이 서로를
 * 참조하며 살아 있어 보이지만 아무도 클러스터를 부르지 않는다.
 *
 * 방법:
 *   1. src/ 비테스트 .ts 전부를 파싱해 모듈 그래프와 top-level 선언 색인을 만든다.
 *   2. 선언 → 선언 간 참조 간선을 만든다(같은 파일 내 이름 / import된 이름 → 원본 모듈).
 *   3. 진입점 파일의 **모듈 최상위에서 실행되는 코드**가 참조하는 것을 seed로 BFS한다.
 *      (진입점은 로드되는 순간 최상위가 실행되므로 그게 유일한 진짜 뿌리다.)
 *   4. 도달 못 한 선언을 분류한다: 테스트만 참조 / 완전 미참조.
 *
 * 공허 통과 방지 — 아래 control이 깨지면 스캔이 고장난 것이므로 FAIL한다:
 *   - 도달 집합이 비어 있거나 비정상적으로 작으면 FAIL.
 *   - positive control: `runReconstruct`는 도달해야 한다(제품 주 경로).
 *   - negative control: `deterministicOntologySeedTimeoutRecovery`는 도달하지 않아야 한다
 *     (백로그가 "처음부터 미배선"으로 확증한 심볼).
 *
 * 한계(정직하게): 문자열 키 동적 디스패치·설정 주도 호출은 정적으로 안 보인다. 그래서 결과는
 * "미배선 후보"이고, 삭제 판단 전에 사람이 확인해야 한다. `--verbose`로 전체 목록을 본다.
 *
 * 실행:
 *   npx tsx scripts/unwired-code-scan.mts [--verbose] [--json]
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SRC_ROOT = "src";
const SCRIPTS_ROOT = "scripts";
/** 제품 진입점. bin/onto → dist/cli.js|src/cli.ts, MCPB 패키징 → mcpb-entry.ts. */
const ENTRY_FILES = ["src/cli.ts", "src/mcpb-entry.ts"];
/**
 * **서브프로세스로 spawn되는** 진입 파일. import 그래프에 없다 — review-invoke.ts의
 * `EXECUTOR_SCRIPT_FILENAMES`가 파일명 문자열로 경로를 만들고 자식 프로세스로 실행한다
 * (run-review-prompt-execution.ts는 `args.some(a => a.includes("codex-review-unit-executor"))`로
 * 브랜드를 되짚는다). 정적 그래프만 보면 전부 죽은 코드로 오판된다.
 */
const SUBPROCESS_ENTRY_FILES = [
  "src/core-runtime/cli/codex-review-unit-executor.ts",
  "src/core-runtime/cli/inline-http-review-unit-executor.ts",
  "src/core-runtime/cli/claude-code-review-unit-executor.ts",
];
/**
 * control. 하나라도 어긋나면 스캔이 고장난 것이다.
 * 공개 CLI 명령을 넣은 이유: 첫 판에서 `cli.ts`의 **동적 `await import()`** 를 따라가지 못해
 * CLI 하위 트리 전체를 놓쳤는데, `runReconstruct`(다른 경로로 도달) 하나만 보던 positive
 * control이 통과해 거짓 안심을 줬다. 진입 경로마다 control이 있어야 한다.
 */
const POSITIVE_CONTROLS = [
  "runReconstruct", // MCP 주 경로
  "startMcpServer", // onto mcp (동적 import)
  "runRegister", // onto register (동적 import)
  "runWatch", // onto watch (동적 import)
  "runConfigureProvider", // onto configure-provider (동적 import)
  "runSeats", // onto seats (동적 import)
];
const NEGATIVE_CONTROL = "deterministicOntologySeedTimeoutRecovery";
/** 도달 선언이 이보다 적으면 그래프 구성이 깨진 것으로 본다. */
const REACHABLE_FLOOR = 500;

const VERBOSE = process.argv.includes("--verbose");
const JSON_OUT = process.argv.includes("--json");

// ------------------------------------------------------------------ 파일 수집

function walk(dir: string, out: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}
const allFiles = walk(SRC_ROOT, []);
const productFiles = allFiles.filter((f) => !f.endsWith(".test.ts"));
const testFiles = allFiles.filter((f) => f.endsWith(".test.ts"));
if (productFiles.length === 0) throw new Error("src/ 에서 비테스트 .ts를 못 찾았다 — repo 루트에서 실행하라");

// ------------------------------------------------------------------ 파싱·색인

interface Decl {
  readonly file: string;
  readonly name: string;
  readonly lines: number;
  readonly exported: boolean;
  /** 이 선언이 참조하는 식별자 이름들. */
  readonly refs: ReadonlySet<string>;
}
/** local 이름 → {원본 모듈 파일, 원본 이름}. 상대 경로만 해석한다. */
interface ImportEdge {
  readonly file: string | null;
  readonly name: string;
}

const sourceOf = new Map<string, ts.SourceFile>();
function parse(file: string): ts.SourceFile {
  const cached = sourceOf.get(file);
  if (cached) return cached;
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  sourceOf.set(file, sf);
  return sf;
}

/** `./x.js` → `src/.../x.ts`. 확장자 없는 것·node:·패키지는 null. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.join(path.dirname(fromFile), spec);
  for (const cand of [base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".mts"), `${base}.ts`, base]) {
    if (fs.existsSync(cand) && cand.endsWith(".ts")) return cand;
  }
  return null;
}

function declNames(stmt: ts.Statement): string[] {
  if (
    ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) ||
    ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isEnumDeclaration(stmt)
  ) return stmt.name ? [stmt.name.text] : [];
  if (ts.isVariableStatement(stmt)) {
    // **바인딩 패턴만** 본다. 초기자 안으로 재귀하면 중첩 함수 내부의 구조분해 바인딩이
    // 최상위 선언으로 오인된다(실제 발생: `const { descriptor_id: _descriptorId, ... } = descriptor`
    // 가 감싼 top-level const의 이름으로 잡혀 102줄짜리 죽은 코드로 보고됐다).
    const out: string[] = [];
    const walkBinding = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) { out.push(name.text); return; }
      for (const el of name.elements) {
        if (ts.isBindingElement(el)) walkBinding(el.name);
      }
    };
    for (const d of stmt.declarationList.declarations) walkBinding(d.name);
    return out;
  }
  return [];
}

function referencedIn(node: ts.Node): Set<string> {
  const out = new Set<string>();
  const w = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isDeclSite = p && (
        (ts.isVariableDeclaration(p) && p.name === n) || (ts.isBindingElement(p) && p.name === n) ||
        (ts.isParameter(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertySignature(p) && p.name === n) ||
        (ts.isMethodSignature(p) && p.name === n) || (ts.isMethodDeclaration(p) && p.name === n) ||
        (ts.isEnumMember(p) && p.name === n) || (ts.isQualifiedName(p) && p.right === n) ||
        (ts.isImportSpecifier(p)) || (ts.isExportSpecifier(p))
      );
      if (!isDeclSite) out.add(n.text);
    }
    ts.forEachChild(n, w);
  };
  ts.forEachChild(node, w);
  return out;
}

const declsByFile = new Map<string, Map<string, Decl>>();
const importsByFile = new Map<string, Map<string, ImportEdge>>();
/** `export * from "./m.js"` 로 이어지는 모듈들. */
const starReexports = new Map<string, string[]>();
/** 모듈 최상위에서 즉시 실행되는 코드가 참조하는 이름 (진입점 seed 계산용). */
const topLevelSideEffectRefs = new Map<string, Set<string>>();
/** 동적 `import("./m.js")` — 대상 모듈과, 구조분해로 알아낸 이름(모르면 null=모듈 전체). */
const dynamicImports = new Map<string, { target: string; names: string[] | null }[]>();

for (const file of productFiles) {
  const sf = parse(file);
  const decls = new Map<string, Decl>();
  const imports = new Map<string, ImportEdge>();
  const stars: string[] = [];
  const sideEffects = new Set<string>();

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const target = resolveSpecifier(file, stmt.moduleSpecifier.text);
      const clause = stmt.importClause;
      if (clause?.name) imports.set(clause.name.text, { file: target, name: "default" });
      const nb = clause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) imports.set(nb.name.text, { file: target, name: "*" });
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) imports.set(el.name.text, { file: target, name: (el.propertyName ?? el.name).text });
      }
      continue;
    }
    if (ts.isExportDeclaration(stmt)) {
      const target = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
        ? resolveSpecifier(file, stmt.moduleSpecifier.text) : null;
      if (!stmt.exportClause && target) { stars.push(target); continue; }
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const orig = (el.propertyName ?? el.name).text;
          if (target) imports.set(`__reexport__${el.name.text}`, { file: target, name: orig });
          else sideEffects.add(orig); // 로컬 선언의 재수출 — 그 선언을 살려 둔다
        }
      }
      continue;
    }
    const names = declNames(stmt);
    if (names.length > 0) {
      const a = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line;
      const b = sf.getLineAndCharacterOfPosition(stmt.getEnd()).line;
      const exported = (ts.getCombinedModifierFlags(stmt as unknown as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
      const refs = referencedIn(stmt);
      for (const n of names) decls.set(n, { file, name: n, lines: b - a + 1, exported, refs });
      continue;
    }
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) continue;
    // 나머지 최상위 문장(expression·if·for·await …)은 로드 시 실행된다.
    for (const r of referencedIn(stmt)) sideEffects.add(r);
  }

  // 동적 `import("./m.js")` — cli.ts의 명령 디스패치가 이 형태다. 정적 import만 보면 CLI
  // 하위 트리 전체를 놓친다. 구조분해된 이름이 보이면 그것만, 아니면 모듈 전체를 살려 둔다
  // (삭제 판단용이므로 과소보다 과대 도달이 안전하다).
  const dyn: { target: string; names: string[] | null }[] = [];
  const findDynamic = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments.length > 0 && ts.isStringLiteral(n.arguments[0] as ts.Node)
    ) {
      const target = resolveSpecifier(file, (n.arguments[0] as ts.StringLiteral).text);
      if (target) {
        // `const { a, b } = await import(...)` 형태에서 a,b를 뽑는다.
        let names: string[] | null = null;
        const awaited = ts.isAwaitExpression(n.parent) ? n.parent : n;
        const decl = awaited.parent;
        if (ts.isVariableDeclaration(decl) && ts.isObjectBindingPattern(decl.name)) {
          names = decl.name.elements
            .map((el) => (el.propertyName ?? el.name))
            .filter(ts.isIdentifier)
            .map((id) => id.text);
        }
        dyn.push({ target, names });
      }
    }
    ts.forEachChild(n, findDynamic);
  };
  findDynamic(sf);
  dynamicImports.set(file, dyn);
  declsByFile.set(file, decls);
  importsByFile.set(file, imports);
  starReexports.set(file, stars);
  topLevelSideEffectRefs.set(file, sideEffects);
}

const totalDecls = [...declsByFile.values()].reduce((s, m) => s + m.size, 0);
if (totalDecls === 0) throw new Error("선언을 하나도 못 읽었다 — 파싱 실패");

// ------------------------------------------------------------------ 도달성 BFS

const key = (file: string, name: string): string => `${file}#${name}`;
const reachable = new Set<string>();
const queue: { file: string; name: string }[] = [];

/** 한 파일에서 이름을 해석해 (파일,이름) 목록으로 만든다. import·재수출·`export *`를 따라간다. */
function resolveName(file: string, name: string, depth = 0): { file: string; name: string }[] {
  if (depth > 8) return [];
  const decls = declsByFile.get(file);
  if (decls?.has(name)) return [{ file, name }];
  const imp = importsByFile.get(file)?.get(name) ?? importsByFile.get(file)?.get(`__reexport__${name}`);
  if (imp?.file) {
    if (imp.name === "*" || imp.name === "default") {
      // 네임스페이스/default import는 그 모듈 전체를 살려 둔다(속성 접근을 정적으로 못 좁힌다).
      const all = declsByFile.get(imp.file);
      return all ? [...all.keys()].map((n) => ({ file: imp.file as string, name: n })) : [];
    }
    return resolveName(imp.file, imp.name, depth + 1);
  }
  for (const star of starReexports.get(file) ?? []) {
    const hit = resolveName(star, name, depth + 1);
    if (hit.length > 0) return hit;
  }
  return [];
}

function push(file: string, name: string): void {
  for (const t of resolveName(file, name)) {
    const k = key(t.file, t.name);
    if (reachable.has(k)) continue;
    reachable.add(k);
    queue.push(t);
  }
}

/** 파일이 "로드된다"고 확정된 순간 그 파일의 부수효과·동적 import를 seed에 넣는다. */
const loadedFiles = new Set<string>();
function markLoaded(file: string): void {
  if (loadedFiles.has(file)) return;
  loadedFiles.add(file);
  for (const r of topLevelSideEffectRefs.get(file) ?? []) push(file, r);
  for (const dyn of dynamicImports.get(file) ?? []) {
    markLoaded(dyn.target);
    if (dyn.names === null) {
      for (const n of declsByFile.get(dyn.target)?.keys() ?? []) push(dyn.target, n);
    } else {
      for (const n of dyn.names) push(dyn.target, n);
    }
  }
}

for (const entry of [...ENTRY_FILES, ...SUBPROCESS_ENTRY_FILES]) {
  if (!declsByFile.has(entry)) throw new Error(`진입점을 못 찾았다: ${entry}`);
  markLoaded(entry);
  // 진입점의 export는 외부(부모 프로세스·패키징)가 소비할 수 있으므로 살려 둔다.
  for (const [n, d] of declsByFile.get(entry) as Map<string, Decl>) if (d.exported) push(entry, n);
  // 진입점이 import만 하고 최상위에서 이름을 안 쓰는 부수효과 import도 살려 둔다.
  for (const [local] of importsByFile.get(entry) ?? []) push(entry, local.replace(/^__reexport__/, ""));
}

while (queue.length > 0) {
  const cur = queue.pop() as { file: string; name: string };
  const d = declsByFile.get(cur.file)?.get(cur.name);
  if (!d) continue;
  markLoaded(cur.file); // 이 파일의 무언가가 쓰이면 그 파일은 로드된다
  for (const r of d.refs) push(cur.file, r);
}

// ------------------------------------------------------------------ 테스트 참조

/** 외부 참조원(테스트 / scripts 하니스)이 import하는 심볼을 모은다. */
function collectExternalRefs(files: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const sf = parse(f);
    const record = (target: string | null, name: string): void => {
      if (!target) return;
      for (const t of resolveName(target, name)) found.add(key(t.file, t.name));
    };
    for (const stmt of sf.statements) {
      const isImport = ts.isImportDeclaration(stmt);
      const isExportFrom = ts.isExportDeclaration(stmt) && stmt.moduleSpecifier !== undefined;
      if (!isImport && !isExportFrom) continue;
      const spec = isImport ? (stmt as ts.ImportDeclaration).moduleSpecifier : (stmt as ts.ExportDeclaration).moduleSpecifier;
      if (!spec || !ts.isStringLiteral(spec)) continue;
      const target = resolveSpecifier(f, spec.text);
      if (!target) continue;
      const nb = isImport
        ? (stmt as ts.ImportDeclaration).importClause?.namedBindings
        : (stmt as ts.ExportDeclaration).exportClause;
      if (nb && (ts.isNamedImports(nb) || ts.isNamedExports(nb))) {
        for (const el of nb.elements) record(target, ((el as ts.ImportSpecifier).propertyName ?? el.name).text);
      } else if (nb && ts.isNamespaceImport(nb)) {
        for (const n of declsByFile.get(target)?.keys() ?? []) found.add(key(target, n));
      } else {
        for (const n of declsByFile.get(target)?.keys() ?? []) found.add(key(target, n));
      }
    }
  }
  return found;
}
/**
 * 외부 참조원이 직접 import한 심볼에서 **전이 폐포**를 구한다. 하니스가 부르는 게이트 함수가
 * 내부에서 쓰는 fixture 상수는 "소비자 전무"가 아니라 "하니스가 쓰는 것"이다. 전파하지 않으면
 * 그 fixture들이 삭제 후보로 잘못 올라온다(실제로 `GOLDEN_FIXTURES`가 그렇게 나왔다).
 */
function closureFrom(roots: ReadonlySet<string>): Set<string> {
  const seen = new Set(roots);
  const stack = [...roots];
  while (stack.length > 0) {
    const k = stack.pop() as string;
    const hash = k.lastIndexOf("#");
    const file = k.slice(0, hash);
    const name = k.slice(hash + 1);
    const d = declsByFile.get(file)?.get(name);
    if (!d) continue;
    for (const r of d.refs) {
      for (const t of resolveName(file, r)) {
        const tk = key(t.file, t.name);
        if (seen.has(tk)) continue;
        seen.add(tk);
        stack.push(tk);
      }
    }
  }
  return seen;
}
const testReferenced = closureFrom(collectExternalRefs(testFiles));
const scriptFiles = fs.existsSync(SCRIPTS_ROOT)
  ? fs.readdirSync(SCRIPTS_ROOT).filter((n) => n.endsWith(".ts") || n.endsWith(".mts")).map((n) => path.join(SCRIPTS_ROOT, n))
  : [];
const scriptReferenced = closureFrom(collectExternalRefs(scriptFiles));

// ------------------------------------------------------------------ 판정·보고

type Consumer = "test-only" | "harness-only" | "test+harness" | "none";
interface Unwired { file: string; name: string; lines: number; exported: boolean; consumer: Consumer }
const unwired: Unwired[] = [];
for (const [file, decls] of declsByFile) {
  for (const [name, d] of decls) {
    const k = key(file, name);
    if (reachable.has(k)) continue;
    const t = testReferenced.has(k);
    const s = scriptReferenced.has(k);
    const consumer: Consumer = t && s ? "test+harness" : t ? "test-only" : s ? "harness-only" : "none";
    unwired.push({ file, name, lines: d.lines, exported: d.exported, consumer });
  }
}

// --- control: 깨지면 스캔이 고장난 것이다
const failures: string[] = [];
if (reachable.size < REACHABLE_FLOOR) {
  failures.push(`도달 선언이 ${reachable.size}개뿐이다(하한 ${REACHABLE_FLOOR}) — 그래프 구성이 깨졌다`);
}
const missedPositives = POSITIVE_CONTROLS.filter((c) => ![...reachable].some((k) => k.endsWith(`#${c}`)));
if (missedPositives.length > 0) {
  failures.push(`positive control 실패 — 도달해야 하는데 미도달: ${missedPositives.join(", ")}`);
}
const negHit = unwired.some((u) => u.name === NEGATIVE_CONTROL);
if (!negHit) failures.push(`negative control 실패: ${NEGATIVE_CONTROL}가 도달 가능으로 나왔다 — 스캔이 너무 관대하다`);

const byFile = new Map<string, { n: number; lines: number }>();
for (const u of unwired) {
  const b = byFile.get(u.file) ?? { n: 0, lines: 0 };
  b.n += 1; b.lines += u.lines; byFile.set(u.file, b);
}
const consumed = unwired.filter((u) => u.consumer !== "none");
const fullyDead = unwired.filter((u) => u.consumer === "none");
const sum = (xs: Unwired[]): number => xs.reduce((s, u) => s + u.lines, 0);

const byConsumer = (c: Consumer): Unwired[] => unwired.filter((u) => u.consumer === c);

if (JSON_OUT) {
  console.log(JSON.stringify({
    entry_files: ENTRY_FILES,
    subprocess_entry_files: SUBPROCESS_ENTRY_FILES,
    scanned_files: productFiles.length,
    total_declarations: totalDecls,
    reachable_declarations: reachable.size,
    unwired_declarations: unwired.length,
    unwired_lines: sum(unwired),
    by_consumer: {
      test_only: { declarations: byConsumer("test-only").length, lines: sum(byConsumer("test-only")) },
      harness_only: { declarations: byConsumer("harness-only").length, lines: sum(byConsumer("harness-only")) },
      test_and_harness: { declarations: byConsumer("test+harness").length, lines: sum(byConsumer("test+harness")) },
      no_consumer: { declarations: fullyDead.length, lines: sum(fullyDead) },
    },
    controls: { positive_missed: missedPositives, negative_ok: negHit },
    by_file: [...byFile.entries()].sort((a, b) => b[1].lines - a[1].lines).map(([f, v]) => ({ file: f, ...v })),
    items: [...unwired].sort((a, b) => b.lines - a.lines),
  }, null, 2));
} else {
  console.log(`진입점       : ${ENTRY_FILES.join(", ")}`);
  console.log(`서브프로세스 : ${SUBPROCESS_ENTRY_FILES.length}개 (spawn되므로 import 그래프에 없다)`);
  console.log(`스캔 대상    : 비테스트 ${productFiles.length}파일 · top-level 선언 ${totalDecls}개`);
  console.log(`도달         : ${reachable.size}개 (${((reachable.size / totalDecls) * 100).toFixed(1)}%)`);
  console.log(`미배선 후보  : ${unwired.length}개 선언 · ${sum(unwired)}줄`);
  console.log(`   ├ 테스트만 참조        : ${String(byConsumer("test-only").length).padStart(4)}개 · ${String(sum(byConsumer("test-only"))).padStart(6)}줄`);
  console.log(`   ├ scripts 하니스만 참조 : ${String(byConsumer("harness-only").length).padStart(4)}개 · ${String(sum(byConsumer("harness-only"))).padStart(6)}줄`);
  console.log(`   ├ 테스트+하니스        : ${String(byConsumer("test+harness").length).padStart(4)}개 · ${String(sum(byConsumer("test+harness"))).padStart(6)}줄`);
  console.log(`   └ **소비자 전무**       : ${String(fullyDead.length).padStart(4)}개 · ${String(sum(fullyDead)).padStart(6)}줄  ← 진짜 죽은 코드 후보`);
  console.log(`control      : positive ${missedPositives.length === 0 ? "OK" : `FAIL(${missedPositives.join(",")})`} · negative ${negHit ? "OK" : "FAIL"}`);

  const deadByFile = new Map<string, { n: number; lines: number }>();
  for (const u of fullyDead) {
    const b = deadByFile.get(u.file) ?? { n: 0, lines: 0 };
    b.n += 1; b.lines += u.lines; deadByFile.set(u.file, b);
  }
  console.log(`\n=== 소비자 전무 — 파일별 상위 20 ===`);
  for (const [f, v] of [...deadByFile.entries()].sort((a, b) => b[1].lines - a[1].lines).slice(0, 20)) {
    console.log(`  ${String(v.lines).padStart(6)}줄  ${String(v.n).padStart(4)}선언  ${f}`);
  }
  console.log(`\n=== 소비자 전무 — 선언 상위 ${VERBOSE ? "전체" : 30} ===`);
  for (const u of [...fullyDead].sort((a, b) => b.lines - a.lines).slice(0, VERBOSE ? 100_000 : 30)) {
    console.log(`  ${String(u.lines).padStart(5)}줄  ${u.exported ? "exp" : "   "}  ${u.name}  @ ${u.file}`);
  }
}

if (failures.length > 0) {
  console.error(`\n!! 스캔 신뢰 불가 — control 위반 ${failures.length}건:`);
  for (const f of failures) console.error(`   ${f}`);
  process.exit(1);
}
// JSON 모드는 stdout이 기계 소비용이다 — 안내문을 섞으면 파서가 깨진다(실제로 깨졌다).
const trailer =
  "\ncontrol 통과. 결과는 **미배선 후보**다 — 문자열 키 동적 디스패치는 정적으로 안 보이므로 삭제 판단 전 확인하라.";
if (JSON_OUT) console.error(trailer);
else console.log(trailer);
