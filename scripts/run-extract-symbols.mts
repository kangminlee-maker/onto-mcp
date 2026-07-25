/**
 * run.ts 심볼 추출기 — 지정한 top-level 선언을 새 파일로 **원문 그대로** 옮긴다.
 *
 * 손으로 옮기면 6,359줄짜리 directive-author에서 반드시 실수가 난다. 이 도구는
 * 이동을 기계가 하게 만들고, 사람은 판단(무엇을 옮길지)만 한다:
 *
 *   - 선언 본문은 슬라이스로만 이동한다. 재작성·재포맷 없음 → 바이트 동일성이 구성상 보장.
 *     `export` 부착은 예외이며, 동일성 검사기가 그 차이만 정규화한다.
 *   - 옮길 심볼이 run.ts에 **남는** 심볼을 참조하면 역방향 import(=순환)가 되므로
 *     BLOCKER로 보고하고 아무것도 쓰지 않는다.
 *   - 필요한 import는 run.ts의 import 문에서 실제 사용된 것만 골라 재구성한다
 *     (type-only 여부·별칭 보존).
 *
 * 기본은 dry-run(보고만). `--apply`가 있어야 파일을 쓴다.
 *
 * `--append`는 **이미 있는 모듈**에 덧붙인다. concept economy 때문에 필요하다: 옮길 심볼이
 * 이미 존재하는 개념에 속하면(예: `CODE_*` 프롬프트 계약 3종은 `authoring-llm-call.ts`가
 * 소유한 `AUTHORING_PROMPT_CONTRACT_VERSION`·`RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`·
 * `authoringPromptContractSha256`의 code 변종 쌍이다) 옆에 근접 중복 모듈을 새로 만드는 것이
 * 아니라 그 모듈로 들어가야 한다. append 모드도 본문은 슬라이스로만 옮기므로 바이트 동일성은
 * 그대로 보장되고, 목적지가 이미 가진 import는 재사용하며 이름 충돌은 FAIL한다.
 *
 * 실행:
 *   npx tsx scripts/run-extract-symbols.mts --to <dest.ts> --symbols A,B,C [--apply] [--append]
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const RUN_TS = "src/core-runtime/reconstruct/run.ts";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APPLY = argv.includes("--apply");
const APPEND = argv.includes("--append");
const DEST = flag("--to");
const SYMBOLS = (flag("--symbols") ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);

if (DEST === undefined || SYMBOLS.length === 0) {
  console.error("사용법: --to <dest.ts> --symbols A,B,C [--apply] [--append]");
  process.exit(2);
}
if (APPEND && !fs.existsSync(DEST)) {
  console.error(`!! --append인데 목적지가 없다: ${DEST} — 신규 생성은 --append 없이.`);
  process.exit(2);
}

const runText = fs.readFileSync(RUN_TS, "utf8");
const src = ts.createSourceFile(RUN_TS, runText, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const full = src.getFullText();

// ------------------------------------------------------- 선언·import 색인

const namesOf = (node: ts.Node): string[] => {
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
};

const stmtByName = new Map<string, ts.Statement>();
const topLevelNames = new Set<string>();
for (const stmt of src.statements) {
  for (const name of namesOf(stmt)) {
    stmtByName.set(name, stmt);
    topLevelNames.add(name);
  }
}

interface ImportBinding {
  readonly specifier: string;
  /** 원본 이름. 별칭이 없으면 local과 같다. */
  readonly propertyName: string;
  /** `import type {...}` 또는 `{ type X }`. */
  readonly isType: boolean;
  readonly kind: "named" | "default" | "namespace";
}
function collectImportBindings(sf: ts.SourceFile): Map<string, ImportBinding> {
  const out = new Map<string, ImportBinding>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const specifier = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (!clause) continue;
    const declIsType = clause.isTypeOnly;
    if (clause.name) {
      out.set(clause.name.text, {
        specifier, propertyName: clause.name.text, isType: declIsType, kind: "default",
      });
    }
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      out.set(bindings.name.text, {
        specifier, propertyName: bindings.name.text, isType: declIsType, kind: "namespace",
      });
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        out.set(el.name.text, {
          specifier,
          propertyName: (el.propertyName ?? el.name).text,
          isType: declIsType || el.isTypeOnly,
          kind: "named",
        });
      }
    }
  }
  return out;
}
const importBindings = collectImportBindings(src);

// --------------------------------------------------------- 참조 위치 판별

/** 선언 이름·프로퍼티 키는 동명이인일 뿐 참조가 아니다. */
function isReferencePosition(node: ts.Identifier): boolean {
  const p = node.parent;
  if (!p) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (ts.isQualifiedName(p) && p.right === node) return false;
  if (ts.isPropertyAssignment(p) && p.name === node) return false;
  if (ts.isPropertySignature(p) && p.name === node) return false;
  if (ts.isMethodSignature(p) && p.name === node) return false;
  if (ts.isMethodDeclaration(p) && p.name === node) return false;
  if (ts.isPropertyDeclaration(p) && p.name === node) return false;
  if (ts.isGetAccessorDeclaration(p) && p.name === node) return false;
  if (ts.isSetAccessorDeclaration(p) && p.name === node) return false;
  if (ts.isEnumMember(p) && p.name === node) return false;
  if (ts.isBindingElement(p) && p.propertyName === node) return false;
  // 선언되는 이름 자체 (지역 변수·파라미터·함수명 …)
  if (ts.isVariableDeclaration(p) && p.name === node) return false;
  if (ts.isParameter(p) && p.name === node) return false;
  if (ts.isFunctionDeclaration(p) && p.name === node) return false;
  if (ts.isFunctionExpression(p) && p.name === node) return false;
  if (ts.isClassDeclaration(p) && p.name === node) return false;
  if (ts.isInterfaceDeclaration(p) && p.name === node) return false;
  if (ts.isTypeAliasDeclaration(p) && p.name === node) return false;
  if (ts.isEnumDeclaration(p) && p.name === node) return false;
  if (ts.isTypeParameterDeclaration(p) && p.name === node) return false;
  if (ts.isBindingElement(p) && p.name === node) return false;
  return true;
}

function referencedIdentifiers(node: ts.Node): Set<string> {
  const out = new Set<string>();
  const walk = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && isReferencePosition(n)) out.add(n.text);
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(node, walk);
  return out;
}

// ------------------------------------------------------------- 이동 대상

interface Span {
  readonly name: string;
  readonly stmt: ts.Statement;
  /** 선행 JSDoc 포함 시작 위치. */
  readonly start: number;
  /** 선언 자체의 시작 위치 (export 삽입 지점). */
  readonly declStart: number;
  readonly end: number;
  readonly exported: boolean;
}

/** 선행 주석 중 선언에 붙어 있는 것(사이에 빈 줄 없음)만 함께 옮긴다. */
function spanStart(stmt: ts.Statement): number {
  const ranges = ts.getLeadingCommentRanges(full, stmt.getFullStart()) ?? [];
  let attachedFrom = stmt.getStart(src);
  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    const r = ranges[i] as ts.CommentRange;
    const between = full.slice(r.end, attachedFrom);
    if ((between.match(/\n/g) ?? []).length > 1) break;
    attachedFrom = r.pos;
  }
  return attachedFrom;
}

const missing = SYMBOLS.filter((s) => !stmtByName.has(s));
if (missing.length > 0) {
  console.error(`!! run.ts에 없는 심볼: ${missing.join(", ")}`);
  process.exit(1);
}

// 한 VariableStatement가 여러 이름을 선언하면 통째로 한 번만 옮긴다.
const movedStmts = [...new Set(SYMBOLS.map((s) => stmtByName.get(s) as ts.Statement))];
const movedNames = new Set<string>(movedStmts.flatMap((s) => namesOf(s)));
const spans: Span[] = movedStmts
  .map((stmt) => ({
    name: namesOf(stmt).join(", "),
    stmt,
    start: spanStart(stmt),
    declStart: stmt.getStart(src),
    end: stmt.getEnd(),
    // stmtByName에 담기는 문장은 namesOf가 이름을 뽑아낸 선언문뿐이다(함수·클래스·인터페이스·
    // 타입 별칭·enum·변수문). ts.Statement는 Declaration의 브랜드를 갖지 않으므로 직접 캐스팅이
    // 막힌다 — 좁히는 조건이 namesOf 쪽에 있어 여기서 재검사할 수 없다.
    exported:
      (ts.getCombinedModifierFlags(stmt as unknown as ts.Declaration) & ts.ModifierFlags.Export) !== 0,
  }))
  .sort((a, b) => a.start - b.start);

const impliedExtra = [...movedNames].filter((n) => !SYMBOLS.includes(n));
if (impliedExtra.length > 0) {
  console.log(`  참고: 같은 선언문에 묶여 함께 이동하는 이름 — ${impliedExtra.join(", ")}\n`);
}

// ----------------------------------------------------------- 의존 분석

const movedRefs = new Set<string>();
for (const s of movedStmts) for (const r of referencedIdentifiers(s)) movedRefs.add(r);

const backRefs = [...movedRefs].filter((r) => topLevelNames.has(r) && !movedNames.has(r)).sort();
const neededImports = [...movedRefs].filter((r) => importBindings.has(r)).sort();

const remainingStmts = src.statements.filter((s) => !movedStmts.includes(s as ts.Statement));
const remainingRefs = new Set<string>();
for (const s of remainingStmts) for (const r of referencedIdentifiers(s)) remainingRefs.add(r);
const runNeedsBack = [...movedNames].filter((n) => remainingRefs.has(n)).sort();

console.log(`이동 대상 : ${movedStmts.length}개 선언 · ${movedNames.size}개 이름`);
console.log(`목적지    : ${DEST}`);
const movedLines = spans.reduce((sum, s) => sum + full.slice(s.start, s.end).split("\n").length, 0);
console.log(`이동 줄수 : 약 ${movedLines}줄 (선행 주석 포함)\n`);

if (backRefs.length > 0) {
  console.error("!! BLOCKER — 옮길 코드가 run.ts에 남는 심볼을 참조한다 (역방향 import = 순환):");
  for (const r of backRefs) console.error(`     ${r}`);
  console.error("\n   해소: 그 심볼도 함께 옮기거나, 먼저 공용 기반으로 빼라. 아무것도 쓰지 않았다.");
  process.exit(1);
}
console.log("의존 점검 : run.ts 잔류 심볼 참조 0개 — 순환 없음 (안전)");
console.log(`필요 import: ${neededImports.length}개 · run.ts가 되가져갈 심볼: ${runNeedsBack.length}개`);
if (runNeedsBack.length > 0) console.log(`             ${runNeedsBack.join(", ")}`);

// ------------------------------------------------------------- 파일 생성

/** 옮긴 뒤에도 밖에서 보여야 하는가 = 원래 export였거나, run.ts가 되가져간다. */
const mustExport = (s: Span): boolean =>
  s.exported || namesOf(s.stmt).some((n) => runNeedsBack.includes(n));

/**
 * append 모드의 목적지 사실관계. 목적지가 이미 가진 import는 재사용하고(같은 specifier +
 * 같은 원본 이름일 때만), 이름이 다른 것에 묶여 있으면 조용히 잘못 해석되지 않도록 FAIL한다.
 * 목적지가 run.js에서 가져오던 심볼이 이제 자기 것이 되면 그 import는 자기 참조가 되므로 걷어낸다.
 */
interface DestFacts {
  readonly text: string;
  readonly declaredNames: Set<string>;
  readonly imports: Map<string, ImportBinding>;
  readonly lastImportEnd: number;
  readonly selfImportLocals: Set<string>;
}
const RUN_SPECIFIER = "./run.js";
/** 목적지 모듈을 run.ts가 가리킬 때 쓰는 specifier — self-resolution 판정에 쓴다. */
const DEST_SELF_SPECIFIER = `./${path.basename(DEST).replace(/\.ts$/, ".js")}`;
let destFacts: DestFacts | undefined;
/**
 * 그 이름이 목적지 안에서 **자기 선언으로 해결되는가**. run.ts가 목적지 모듈에서 별칭 없이
 * named import해 온 이름이고 목적지가 그것을 선언하고 있으면 같은 심볼이므로 import가 필요 없다.
 * 별칭(`A as B`)은 목적지에 B가 없으므로 제외한다 — 이름을 바꿔주는 일은 이 도구가 하지 않는다.
 */
const resolvesInDestItself = (local: string): boolean => {
  const mine = importBindings.get(local);
  return mine !== undefined && mine.kind === "named" && mine.specifier === DEST_SELF_SPECIFIER &&
    mine.propertyName === local && (destFacts?.declaredNames.has(local) ?? false);
};
if (APPEND) {
  const destText0 = fs.readFileSync(DEST, "utf8");
  const destSrc = ts.createSourceFile(DEST, destText0, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const declaredNames = new Set<string>();
  for (const stmt of destSrc.statements) for (const n of namesOf(stmt)) declaredNames.add(n);
  const destImports = collectImportBindings(destSrc);
  const destLastImport = [...destSrc.statements].filter(ts.isImportDeclaration).pop();
  if (!destLastImport) {
    console.error(`!! 목적지에 import 문이 없다: ${DEST} — 삽입 지점을 정할 수 없다.`);
    process.exit(1);
  }
  const selfImportLocals = new Set(
    [...destImports.entries()]
      .filter(([, b]) => b.specifier === RUN_SPECIFIER && movedNames.has(b.propertyName))
      .map(([local]) => local),
  );
  destFacts = {
    text: destText0,
    declaredNames,
    imports: destImports,
    lastImportEnd: destLastImport.getEnd(),
    selfImportLocals,
  };

  const nameCollisions = [...movedNames].filter((n) => declaredNames.has(n)).sort();
  if (nameCollisions.length > 0) {
    console.error(`!! BLOCKER — 목적지에 같은 이름의 top-level 선언이 이미 있다: ${nameCollisions.join(", ")}`);
    console.error("   덧붙이면 재선언 충돌이다. 이름을 확인하고 목적지를 바꿔라. 아무것도 쓰지 않았다.");
    process.exit(1);
  }
  // 옮길 코드가 참조하는 이름이 목적지에서 **다른 것**을 가리키면 조용히 의미가 바뀐다.
  // 예외: run.ts가 바로 그 목적지 모듈에서 별칭 없이 import해 왔고 목적지가 그 이름을 스스로
  // 선언한다면 **같은 심볼**이다 — 의미 변경이 아니라 import가 불필요해지는 경우다.
  const shadowed = neededImports.filter((local) => {
    const mine = importBindings.get(local) as ImportBinding;
    const theirs = destFacts?.imports.get(local);
    if (theirs !== undefined) {
      return theirs.specifier !== mine.specifier || theirs.propertyName !== mine.propertyName;
    }
    if (!declaredNames.has(local)) return false;
    return !resolvesInDestItself(local);
  }).sort();
  if (shadowed.length > 0) {
    console.error("!! BLOCKER — 옮길 코드가 쓰는 이름이 목적지에서 다른 것을 가리킨다 (조용한 의미 변경):");
    for (const n of shadowed) {
      const mine = importBindings.get(n) as ImportBinding;
      const theirs = destFacts?.imports.get(n);
      console.error(
        `     ${n}: run.ts=${mine.propertyName}@${mine.specifier} / 목적지=` +
          (theirs ? `${theirs.propertyName}@${theirs.specifier}` : "지역 선언"),
      );
    }
    console.error("\n   해소: 목적지를 바꾸거나 그 심볼도 함께 옮겨라. 아무것도 쓰지 않았다.");
    process.exit(1);
  }
}

/**
 * append 모드에서 다시 쓰지 않는 것: (1) 목적지가 이미 동일하게 import하는 이름,
 * (2) 목적지가 스스로 선언해서 그 안에서 해결되는 이름(self-resolution).
 */
const importsToRender = destFacts === undefined
  ? neededImports
  : neededImports.filter((local) => !destFacts?.imports.has(local) && !resolvesInDestItself(local));
if (destFacts !== undefined) {
  const selfResolved = neededImports.filter((local) => resolvesInDestItself(local));
  console.log(
    `목적지 재사용: import ${neededImports.length - importsToRender.length - selfResolved.length}개 재사용 · ` +
      `자기선언 해결 ${selfResolved.length}개 · ${importsToRender.length}개 신규 · ` +
      `자기참조 된 run.js import ${destFacts.selfImportLocals.size}개 제거`,
  );
  if (selfResolved.length > 0) console.log(`             자기선언: ${selfResolved.join(", ")}`);
}

const bySpecifier = new Map<string, { value: string[]; type: string[]; ns: string[]; def: string[] }>();
for (const local of importsToRender) {
  const b = importBindings.get(local) as ImportBinding;
  const bucket = bySpecifier.get(b.specifier) ??
    { value: [] as string[], type: [] as string[], ns: [] as string[], def: [] as string[] };
  const rendered = b.propertyName === local ? local : `${b.propertyName} as ${local}`;
  if (b.kind === "namespace") bucket.ns.push(local);
  else if (b.kind === "default") bucket.def.push(local);
  else if (b.isType) bucket.type.push(rendered);
  else bucket.value.push(rendered);
  bySpecifier.set(b.specifier, bucket);
}

/** 한 줄이 길어지면 repo 관례대로 멀티라인 named import로 편다. */
function renderNamed(keyword: string, names: readonly string[], specifier: string): string {
  const sorted = [...names].sort();
  const oneLine = `import ${keyword}{ ${sorted.join(", ")} } from "${specifier}";`;
  if (oneLine.length <= 100) return oneLine;
  return `import ${keyword}{\n${sorted.map((n) => `  ${n},`).join("\n")}\n} from "${specifier}";`;
}

// node: 빌트인을 먼저 두는 run.ts의 배치를 따른다.
const specifierRank = (s: string): number => (s.startsWith("node:") ? 0 : 1);
const importLines: string[] = [];
for (
  const [specifier, b] of [...bySpecifier.entries()].sort((a, b2) =>
    specifierRank(a[0]) - specifierRank(b2[0]) || a[0].localeCompare(b2[0])
  )
) {
  for (const n of b.ns) importLines.push(`import * as ${n} from "${specifier}";`);
  for (const n of b.def) importLines.push(`import ${n} from "${specifier}";`);
  if (b.value.length > 0) importLines.push(renderNamed("", b.value, specifier));
  if (b.type.length > 0) importLines.push(renderNamed("type ", b.type, specifier));
}

const bodies = spans.map((s) => {
  const text = full.slice(s.start, s.end);
  if (!mustExport(s) || s.exported) return text;
  const offset = s.declStart - s.start;
  return `${text.slice(0, offset)}export ${text.slice(offset)}`;
});

/** 자기 것이 된 심볼의 run.js import specifier를 목적지에서 걷어낸다(줄/선언 단위 삭제). */
function stripSelfImports(text: string, locals: ReadonlySet<string>): string {
  if (locals.size === 0) return text;
  const sf = ts.createSourceFile(DEST as string, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const lines = text.split("\n");
  const drop = new Set<number>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== RUN_SPECIFIER) continue;
    const named = stmt.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    const doomed = named.elements.filter((e) => locals.has(e.name.text));
    if (doomed.length === 0) continue;
    if (doomed.length === named.elements.length) {
      const a = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line;
      const b = sf.getLineAndCharacterOfPosition(stmt.getEnd()).line;
      for (let i = a; i <= b; i += 1) drop.add(i);
      continue;
    }
    for (const e of doomed) {
      const a = sf.getLineAndCharacterOfPosition(e.getStart(sf)).line;
      const b = sf.getLineAndCharacterOfPosition(e.getEnd()).line;
      if (a !== b || (lines[a] as string).trim().replace(/,$/, "") !== e.getText(sf).trim()) {
        throw new Error(`목적지의 run.js import specifier가 줄 단독이 아니다: ${e.name.text}`);
      }
      drop.add(a);
    }
  }
  return lines.filter((_, i) => !drop.has(i)).join("\n");
}

let destText: string;
if (destFacts === undefined) {
  destText = `${importLines.join("\n")}\n\n${bodies.join("\n\n")}\n`;
} else {
  // 신규 import는 목적지의 마지막 import 뒤에 붙이고, 본문은 파일 끝에 덧붙인다.
  const head = destFacts.text.slice(0, destFacts.lastImportEnd);
  const tail = destFacts.text.slice(destFacts.lastImportEnd);
  const withImports = importLines.length > 0 ? `${head}\n${importLines.join("\n")}${tail}` : `${head}${tail}`;
  const cleaned = stripSelfImports(withImports, destFacts.selfImportLocals);
  destText = `${cleaned.replace(/\n*$/, "")}\n\n${bodies.join("\n\n")}\n`;
}

// ------------------------------------------------------------ run.ts 수정

let out = "";
let cursor = 0;
for (const s of spans) {
  out += full.slice(cursor, s.start);
  // 선언 뒤에 붙은 빈 줄까지 함께 걷어내야 잔해가 남지 않는다.
  let after = s.end;
  while (after < full.length && /[ \t\r]/.test(full[after] as string)) after += 1;
  while (after < full.length && full[after] === "\n") {
    const probe = after + 1;
    let q = probe;
    while (q < full.length && /[ \t\r]/.test(full[q] as string)) q += 1;
    if (q < full.length && full[q] === "\n") after = q;
    else { after = probe; break; }
  }
  cursor = after;
}
out += full.slice(cursor);

/**
 * 타입 전용 선언은 `import type`으로 되가져와야 한다. value 형태로 쓰면 (1) repo 관례에
 * 어긋나고 (2) 이 파일의 import 색인이 다음 추출에서 그 심볼을 value로 오인해, 잘못된
 * 형태가 이어지는 추출마다 전파된다. interface·type alias만 타입 전용이다 — class·enum은
 * 값이기도 하다.
 */
const isTypeOnlyDecl = (name: string): boolean => {
  const stmt = stmtByName.get(name);
  return stmt !== undefined && (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt));
};

const destRel = `./${path.basename(DEST).replace(/\.ts$/, ".js")}`;
if (runNeedsBack.length > 0) {
  const lastImport = [...src.statements].filter(ts.isImportDeclaration).pop();
  if (!lastImport) throw new Error("run.ts에서 import 문을 찾지 못했다");
  const anchor = full.slice(0, lastImport.getEnd());
  const idx = out.indexOf(anchor);
  if (idx !== 0) throw new Error("import 블록이 이동으로 훼손됐다 — 중단");
  const backTypes = runNeedsBack.filter(isTypeOnlyDecl);
  const backValues = runNeedsBack.filter((n) => !isTypeOnlyDecl(n));
  const backLines = [
    ...(backValues.length > 0 ? [renderNamed("", backValues, destRel)] : []),
    ...(backTypes.length > 0 ? [renderNamed("type ", backTypes, destRel)] : []),
  ];
  out = `${anchor}\n${backLines.join("\n")}${out.slice(anchor.length)}`;
}

console.log(`\nrun.ts    : ${full.split("\n").length}줄 → ${out.split("\n").length}줄`);
console.log(
  `${DEST} : ${
    destFacts === undefined
      ? `${destText.split("\n").length}줄`
      : `${destFacts.text.split("\n").length}줄 → ${destText.split("\n").length}줄 (append)`
  }`,
);

if (!APPLY) {
  console.log("\n(dry-run — 아무것도 쓰지 않았다. 적용하려면 --apply)");
  console.log(`\n--- 목적지 ${destFacts === undefined ? "import 블록" : "신규 import"} 미리보기 ---`);
  console.log(importLines.length > 0 ? importLines.join("\n") : "(신규 import 없음 — 목적지가 전부 갖고 있다)");
  process.exit(0);
}

if (!APPEND && fs.existsSync(DEST)) {
  console.error(`!! 목적지가 이미 있다: ${DEST} — 덮어쓰지 않는다. 덧붙이려면 --append.`);
  process.exit(1);
}
fs.writeFileSync(DEST, destText, "utf8");
fs.writeFileSync(RUN_TS, out, "utf8");
console.log("\n적용 완료. 다음: npm run check:ts-core → 동일성 검사기 → vitest");
