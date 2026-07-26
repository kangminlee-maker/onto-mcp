/**
 * 죽은 named import 정리기 — 심볼 추출이 만든 잔해만 걷어낸다.
 *
 * 순수 이동으로 심볼이 빠져나가면 그 심볼만 쓰던 import가 파일에 남는다. tsconfig에
 * `noUnusedLocals`가 없어 tsc는 이것을 잡지 않고, vitest도 잡지 않는다. 그냥 지저분한
 * 문제가 아니다: **연결-읽기(concatenated-read) 게이트에서 죽은 사본이 검사를 침묵시킨다.**
 * 2차 추출에서 run.ts에 남은 죽은 `runtimeProvenanceBindingsRequiredFragments` import가
 * G9(final-output-sections-parity)의 "필수 모듈 심볼을 import하는가" 검사를 공허 통과시켰고,
 * 정리 전 rc=0 / 정리 후 rc=1로 그 효과를 확인했다. 그래서 배치마다 돌린다.
 *
 * 안전 장치 — 손 패치가 아니라 AST가 지목한 범위만 고친다:
 *   - 사용 횟수가 1회(=import 줄 자신)뿐인 named import만 대상.
 *   - 선언의 specifier가 전부 죽고 default import도 없으면 그 import 선언을 통째로 지운다.
 *   - 일부만 죽으면 `{…}` 범위만 **살아남은 specifier의 원문으로** 다시 쓴다. 각 specifier의
 *     텍스트를 그대로 쓰므로 `type ` 접두사와 별칭(`A as B`)이 보존되고, 원본이 여러 줄이면
 *     여러 줄로, 한 줄이면 한 줄로 되돌려 repo 형태를 유지한다.
 *   - `{…}` 밖은 한 글자도 건드리지 않는다(`import type` 키워드·specifier 문자열·세미콜론).
 *   - import를 하나도 못 읽으면 파싱 실패로 보고 FAIL한다(공허 통과 방지).
 * default·namespace import는 건드리지 않는다(부수효과 import일 수 있다).
 *
 * 실행:
 *   npx tsx scripts/run-dead-import-clean.mts <file.ts> [<file2.ts> …] [--dry]
 */
import fs from "node:fs";
import ts from "typescript";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const files = argv.filter((a) => !a.startsWith("--"));

if (files.length === 0) {
  console.error("사용법: npx tsx scripts/run-dead-import-clean.mts <file.ts> [...] [--dry]");
  process.exit(2);
}

interface Outcome {
  readonly file: string;
  readonly dead: readonly string[];
  readonly droppedSpecifiers: number;
  readonly droppedDeclarations: number;
  readonly droppedLines: number;
}

function namedImportLocals(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const named = stmt.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const el of named.elements) out.push(el.name.text);
  }
  return out;
}

function clean(file: string): Outcome {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const locals = namedImportLocals(sf);
  if (locals.length === 0) {
    throw new Error(`${file}: named import를 하나도 못 읽었다 — 파싱 실패로 본다(공허 통과 방지).`);
  }
  const occurrences = (name: string): number =>
    (text.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length;
  const dead = new Set(locals.filter((n) => occurrences(n) <= 1));
  if (dead.size === 0) {
    return { file, dead: [], droppedSpecifiers: 0, droppedDeclarations: 0, droppedLines: 0 };
  }

  /** 뒤에서 앞으로 적용할 텍스트 치환. 앞쪽 오프셋이 밀리지 않는다. */
  interface Edit {
    readonly start: number;
    readonly end: number;
    readonly replacement: string;
  }
  const edits: Edit[] = [];
  let droppedSpecifiers = 0;
  let droppedDeclarations = 0;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const named = stmt.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    const doomed = named.elements.filter((el) => dead.has(el.name.text));
    if (doomed.length === 0) continue;
    droppedSpecifiers += doomed.length;

    // 선언에 살아남는 specifier가 없고 default import도 없으면 선언째로 지운다(줄 끝 개행까지).
    if (doomed.length === named.elements.length && stmt.importClause?.name === undefined) {
      let end = stmt.getEnd();
      while (end < text.length && /[ \t\r]/.test(text[end] as string)) end += 1;
      if (text[end] === "\n") end += 1;
      edits.push({ start: stmt.getStart(sf), end, replacement: "" });
      droppedDeclarations += 1;
      continue;
    }

    // 일부만 죽음: `{…}` 범위만 살아남은 specifier의 원문으로 다시 쓴다.
    const survivors = named.elements.filter((el) => !dead.has(el.name.text)).map((el) => el.getText(sf));
    if (survivors.length === 0) throw new Error(`${file}: 살아남는 specifier 계산이 틀렸다`);
    const bracesStart = named.getStart(sf);
    const original = text.slice(bracesStart, named.getEnd());
    const wasMultiline = original.includes("\n");
    const replacement = wasMultiline
      ? `{\n${survivors.map((s) => `  ${s},`).join("\n")}\n}`
      : `{ ${survivors.join(", ")} }`;
    edits.push({ start: bracesStart, end: named.getEnd(), replacement });
  }

  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  // 고친 결과가 여전히 파싱되고, 죽은 이름이 남지 않았는지 스스로 확인한다.
  const after = ts.createSourceFile(file, out, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const leftover = namedImportLocals(after).filter((n) => dead.has(n));
  if (leftover.length > 0) throw new Error(`${file}: 제거 후에도 남아 있다 — ${leftover.join(", ")}`);

  if (!DRY) fs.writeFileSync(file, out, "utf8");
  return {
    file,
    dead: [...dead].sort(),
    droppedSpecifiers,
    droppedDeclarations,
    droppedLines: text.split("\n").length - out.split("\n").length,
  };
}

let total = 0;
for (const file of files) {
  const r = clean(file);
  total += r.dead.length;
  if (r.dead.length === 0) {
    console.log(`${file}: 죽은 named import 없음`);
    continue;
  }
  console.log(
    `${file}: 죽은 named import ${r.dead.length}개` +
      `${DRY ? " (--dry — 쓰지 않았다)" : ` 제거 — specifier ${r.droppedSpecifiers} · 선언 ${r.droppedDeclarations} · 줄 ${r.droppedLines}`}`,
  );
  for (const n of r.dead) console.log(`  - ${n}`);
}
console.log(`\n합계 ${total}개.${DRY ? "" : " 다음: check:ts-core → 동일성 검사기 → vitest"}`);
