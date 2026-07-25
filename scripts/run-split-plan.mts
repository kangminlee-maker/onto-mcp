/**
 * run.ts 분해 계획기 — 추출 순서와 목적지를 추측이 아니라 계산으로 정한다.
 *
 * `reconstruct/run.ts`는 21.5k줄 단일 파일이고, 그 안의 top-level 선언들은 이미
 * 개념별로 뭉쳐 있다. 이 스크립트는 그 뭉침을 기계로 드러낸다:
 *
 *   1. 선언 간 의존 그래프의 SCC — 크기 2 이상이면 "함께 움직여야만 하는 덩어리"이고,
 *      쪼개면 순환 import가 된다. 추출 전 반드시 0이어야 한다.
 *   2. 심볼별 "집" 배정 — 후보 모듈 중 정확히 1개에서만 도달 가능하면 그 모듈 소유,
 *      2개 이상이면 공용 기반, 어디서도 도달 불가면 run.ts 잔류 또는 죽은 코드.
 *
 * 추출이 진행되면 MODULES에서 이미 옮긴 항목을 지우고 다시 돌려, 남은 run.ts에 대해
 * 같은 판단을 반복한다.
 *
 * 실행: npx tsx scripts/run-split-plan.mts [--verbose]
 */
import ts from "typescript";
import fs from "node:fs";

const FILE = "src/core-runtime/reconstruct/run.ts";
const VERBOSE = process.argv.includes("--verbose");
const TOP_N = VERBOSE ? Number.MAX_SAFE_INTEGER : 12;

/**
 * 추출 후보 모듈과 그 진입 심볼(root). 한 root의 의존 폐포가 그 모듈이 끌고 가는 범위다.
 * run(orchestrator)는 "옮기지 않고 남는 것"을 재는 대조군이므로 항상 마지막에 둔다.
 */
const MODULES: Record<string, readonly string[]> = {
  "graceful-terminal": [
    "isZeroObservationGracefulTerminalEligible",
    "GracefulTerminalSignal",
    "isGracefulTerminalSignal",
    "SEED_READINESS_TERMINAL_ROUTE",
  ],
  "leaf-read-stage": ["runSpreadsheetLeafReadStage"],
  "value-read-stage": ["runMaturationValueReadStage"],
  "semantic-map-stage": ["runSemanticMapStage"],
  "run-manifest": ["createRunManifest"],
  "directive-author": ["createDirectCallReconstructDirectiveAuthor"],
  "run(orchestrator)": ["runReconstruct"],
};

interface Decl {
  readonly name: string;
  readonly exported: boolean;
  readonly start: number;
  readonly end: number;
  readonly lines: number;
  readonly deps: Set<string>;
}

if (!fs.existsSync(FILE)) throw new Error(`대상 파일 없음: ${FILE} (repo 루트에서 실행하라)`);
const text = fs.readFileSync(FILE, "utf8");
const src = ts.createSourceFile(FILE, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const lineOf = (pos: number): number => src.getLineAndCharacterOfPosition(pos).line + 1;

function declaredNames(node: ts.Node): string[] {
  if (
    ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name ? [node.name.text] : [];
  }
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .map((d) => (ts.isIdentifier(d.name) ? d.name.text : ""))
      .filter((n) => n.length > 0);
  }
  return [];
}

const isExported = (node: ts.Node): boolean =>
  (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;

const decls = new Map<string, Decl>();
for (const stmt of src.statements) {
  for (const name of declaredNames(stmt)) {
    const start = lineOf(stmt.getStart(src));
    const end = lineOf(stmt.getEnd());
    decls.set(name, { name, exported: isExported(stmt), start, end, lines: end - start + 1, deps: new Set() });
  }
}

// 본문이 참조하는 같은 파일의 top-level 이름을 모은다. 프로퍼티 이름(obj.foo의 foo,
// { foo: ... }의 키)은 동명이인일 뿐 참조가 아니므로 제외한다.
for (const stmt of src.statements) {
  const names = declaredNames(stmt);
  if (names.length === 0) continue;
  const self = new Set(names);
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && decls.has(node.text) && !self.has(node.text)) {
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node);
      if (!isPropertyName) for (const n of names) decls.get(n)?.deps.add(node.text);
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(stmt, walk);
}

// Tarjan SCC — 크기 2 이상 = 분리 불가 덩어리.
const index = new Map<string, number>();
const low = new Map<string, number>();
const onStack = new Set<string>();
const stack: string[] = [];
const sccs: string[][] = [];
let counter = 0;
function strongconnect(v: string): void {
  index.set(v, counter);
  low.set(v, counter);
  counter += 1;
  stack.push(v);
  onStack.add(v);
  for (const w of decls.get(v)?.deps ?? []) {
    if (!index.has(w)) {
      strongconnect(w);
      low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
    } else if (onStack.has(w)) {
      low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
    }
  }
  if (low.get(v) === index.get(v)) {
    const component: string[] = [];
    let w: string;
    do {
      w = stack.pop() as string;
      onStack.delete(w);
      component.push(w);
    } while (w !== v);
    sccs.push(component);
  }
}
for (const name of decls.keys()) if (!index.has(name)) strongconnect(name);

const linesOf = (names: readonly string[]): number =>
  names.reduce((sum, n) => sum + (decls.get(n)?.lines ?? 0), 0);

const closureOf = (roots: readonly string[]): Set<string> => {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const n = queue.pop() as string;
    if (seen.has(n) || !decls.has(n)) continue;
    seen.add(n);
    for (const d of decls.get(n)?.deps ?? []) queue.push(d);
  }
  return seen;
};

const totalLines = lineOf(text.length);
console.log(`${FILE} — ${totalLines}줄 · top-level 선언 ${decls.size}개\n`);

const cycles = sccs.filter((c) => c.length > 1);
console.log(`=== 순환 덩어리 (분리 불가) — ${cycles.length}개 ===`);
if (cycles.length === 0) {
  console.log("  없음 — 위상 순서를 지키면 순환 import 없이 추출 가능하다.\n");
} else {
  for (const c of cycles.sort((a, b) => linesOf(b) - linesOf(a))) {
    console.log(`  [${c.length}개 · ${linesOf(c)}줄] ${c.join(", ")}`);
  }
  console.log("");
}

const closures = new Map<string, Set<string>>();
for (const [label, roots] of Object.entries(MODULES)) {
  const missing = roots.filter((r) => !decls.has(r));
  if (missing.length > 0) console.log(`  ! ${label}: root 미발견 ${missing.join(", ")} (이미 추출됐는가?)`);
  closures.set(label, closureOf(roots.filter((r) => decls.has(r))));
}

// 배정: 도달 가능한 모듈이 1개면 그 모듈, 2개 이상이면 공용 기반, 0개면 잔류/죽은 코드.
// 단 root 자신은 언제나 자기 모듈 소유다(오케스트레이터 폐포에 포함되더라도).
const home = new Map<string, string>();
for (const name of decls.keys()) {
  const owners = [...closures.entries()].filter(([, set]) => set.has(name)).map(([label]) => label);
  home.set(name, owners.length === 0 ? "(도달 불가)" : owners.length === 1 ? (owners[0] as string) : "shared-base");
}
for (const [label, roots] of Object.entries(MODULES)) {
  for (const r of roots) if (decls.has(r)) home.set(r, label);
}

const byHome = new Map<string, string[]>();
for (const [name, h] of home) {
  const bucket = byHome.get(h);
  if (bucket) bucket.push(name);
  else byHome.set(h, [name]);
}

console.log("=== 심볼별 목적지 배정 ===");
for (const [h, names] of [...byHome.entries()].sort((a, b) => linesOf(b[1]) - linesOf(a[1]))) {
  console.log(`\n${h}  —  ${names.length}개 심볼 · ${linesOf(names)}줄`);
  const sorted = names.sort((a, b) => (decls.get(b)?.lines ?? 0) - (decls.get(a)?.lines ?? 0));
  for (const n of sorted.slice(0, TOP_N)) {
    const d = decls.get(n) as Decl;
    console.log(
      `   ${String(d.lines).padStart(5)}줄  ${String(d.start).padStart(5)}-${String(d.end).padEnd(5)} ` +
        `${d.exported ? "exp" : "   "} ${n}`,
    );
  }
  if (sorted.length > TOP_N) {
    console.log(`   ... 외 ${sorted.length - TOP_N}개 (${linesOf(sorted.slice(TOP_N))}줄) — 전체는 --verbose`);
  }
}

const staying = new Set(["run(orchestrator)", "(도달 불가)"]);
const moving = [...byHome.entries()].filter(([h]) => !staying.has(h)).flatMap(([, names]) => names);
console.log("\n=== 요약 ===");
console.log(`  밖으로 나가는 심볼 : ${moving.length}개 · ${linesOf(moving)}줄`);
console.log(`  run.ts 잔류 예상   : 약 ${totalLines - linesOf(moving)}줄`);
console.log(`  분리 불가 덩어리   : ${cycles.length}개${cycles.length === 0 ? " (안전)" : " (해소 필요)"}`);
