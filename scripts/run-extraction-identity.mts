/**
 * run.ts 추출 바이트 동일성 검사기 — "순수 이동"을 말이 아니라 기계로 증명한다.
 *
 * 기준본(base ref의 run.ts)에서 top-level 선언의 원문 텍스트를 AST로 뜬 뒤,
 * 각 심볼이 지금 어디에 있고 본문이 바이트 단위로 같은지 판정한다.
 *
 *   STAYED   run.ts에 그대로 남아 있고 본문 동일   (잔류분도 변형되면 안 된다)
 *   MOVED    다른 파일로 옮겨졌고 본문 동일
 *   MODIFIED 옮겨졌지만 본문이 다르다              → 실패
 *   MISSING  어디에서도 못 찾았다                  → 실패
 *   DUPLICATE 두 곳 이상에 선언이 있다             → 실패
 *   ADDED    기준본에 없던 선언이 신규 파일에 있다  → 실패 (새 로직 유입)
 *
 * `export` 키워드 추가/제거는 이동에 수반되는 유일한 허용 변경이므로 그 차이만
 * 정규화하고 나머지(공백·주석·식별자 전부)는 엄격 비교한다.
 *
 * 공허한 PASS 방지: 검사 대상(MOVED+MODIFIED)이 0개면 실패로 보고한다. 아직 아무것도
 * 안 옮긴 상태의 "위반 0건"은 증명이 아니다.
 *
 * 실행:
 *   npx tsx scripts/run-extraction-identity.mts [--base <ref>] [--verbose]
 *   npx tsx scripts/run-extraction-identity.mts --self-test   # negative control 포함
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RUN_TS = "src/core-runtime/reconstruct/run.ts";
const SCAN_ROOT = "src";

// ---------------------------------------------------------------- 순수 핵심부

interface DeclText {
  readonly name: string;
  /** export 수식어를 제외한 선언 원문. 바이트 비교의 대상. */
  readonly text: string;
  readonly lines: number;
}

interface Site {
  readonly file: string;
  readonly decl: DeclText;
}

type Verdict = "STAYED" | "MOVED" | "MODIFIED" | "MISSING" | "DUPLICATE";

interface Finding {
  readonly name: string;
  readonly verdict: Verdict;
  readonly lines: number;
  readonly sites: readonly string[];
  /** MODIFIED일 때 첫 불일치 지점 설명. */
  readonly detail?: string;
}

/**
 * export 수식어 뒤부터 선언 끝까지의 원문을 뜬다. 선행 주석(JSDoc)은 선언 본문이
 * 아니므로 제외한다 — 주석 이동 누락은 로직 변경이 아니고, 포함시키면 파일 상단
 * 배치 차이 때문에 거짓 실패가 난다.
 */
function declarationsOf(fileName: string, text: string): DeclText[] {
  const src = ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const full = src.getFullText();
  const out: DeclText[] = [];

  const bodyStart = (node: ts.Node): number => {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const exp = mods?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exp) return node.getStart(src);
    let p = exp.getEnd();
    while (p < full.length && /\s/.test(full[p] as string)) p += 1;
    return p;
  };

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

  for (const stmt of src.statements) {
    const names = namesOf(stmt);
    if (names.length === 0) continue;
    const body = full.slice(bodyStart(stmt), stmt.getEnd());
    const lines = body.split("\n").length;
    for (const name of names) out.push({ name, text: body, lines });
  }
  return out;
}

function firstDifference(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  if (i === n && a.length === b.length) return "차이 없음";
  const line = a.slice(0, i).split("\n").length;
  const show = (s: string): string => JSON.stringify(s.slice(Math.max(0, i - 30), i + 40));
  return `선언 내부 ${line}번째 줄 부근\n      기준본: ${show(a)}\n      현재  : ${show(b)}`;
}

interface Inputs {
  /** base ref의 run.ts 원문. */
  readonly baseRunText: string;
  /**
   * 검사 범위 파일들: 경로 → 원문. **run.ts + 이번 추출로 생긴 신규 파일만**이다.
   *
   * src/ 전체를 훑으면 안 된다: 이 repo는 `isoNow`·`isRecord`·`stableJson` 같은
   * 파일-로컬 헬퍼를 파일마다 독립 선언하는 패턴을 쓰고, 그 동명이인들이 "이동 후보"로
   * 오인돼 추출 전 상태에서 이미 DUPLICATE 20건이 뜬다. 이동 여부는 원래 있던 자리와
   * 새로 만든 자리만 보면 답이 나온다.
   */
  readonly currentFiles: ReadonlyMap<string, string>;
  /** base ref에 존재하던 파일 경로 집합. 여기 없는 파일 = 이번 추출로 생긴 신규 파일. */
  readonly baseFilePaths: ReadonlySet<string>;
}

interface Report {
  readonly findings: readonly Finding[];
  /** 기준본에 없던 신규 선언 (신규 파일 한정). */
  readonly added: readonly { readonly name: string; readonly file: string }[];
  readonly counts: Readonly<Record<Verdict, number>>;
  readonly baseDeclCount: number;
}

function analyze(input: Inputs): Report {
  const base = new Map<string, DeclText>();
  for (const d of declarationsOf(RUN_TS, input.baseRunText)) base.set(d.name, d);

  // 현재 워킹트리 전체의 선언 색인 — 이름당 여러 사이트가 나올 수 있다.
  const sites = new Map<string, Site[]>();
  for (const [file, text] of input.currentFiles) {
    for (const decl of declarationsOf(file, text)) {
      const bucket = sites.get(decl.name);
      if (bucket) bucket.push({ file, decl });
      else sites.set(decl.name, [{ file, decl }]);
    }
  }

  const findings: Finding[] = [];
  for (const [name, baseDecl] of base) {
    const found = sites.get(name) ?? [];
    const paths = found.map((s) => s.file);
    if (found.length === 0) {
      findings.push({ name, verdict: "MISSING", lines: baseDecl.lines, sites: [] });
      continue;
    }
    if (found.length > 1) {
      findings.push({ name, verdict: "DUPLICATE", lines: baseDecl.lines, sites: paths });
      continue;
    }
    const site = found[0] as Site;
    const identical = site.decl.text === baseDecl.text;
    if (!identical) {
      findings.push({
        name,
        verdict: "MODIFIED",
        lines: baseDecl.lines,
        sites: paths,
        detail: firstDifference(baseDecl.text, site.decl.text),
      });
      continue;
    }
    findings.push({
      name,
      verdict: site.file === RUN_TS ? "STAYED" : "MOVED",
      lines: baseDecl.lines,
      sites: paths,
    });
  }

  // 신규 파일에 기준본에 없던 선언이 생겼는가 = 이동이 아닌 새 로직.
  const added: { name: string; file: string }[] = [];
  for (const [file, text] of input.currentFiles) {
    if (input.baseFilePaths.has(file)) continue;
    for (const decl of declarationsOf(file, text)) {
      if (!base.has(decl.name)) added.push({ name: decl.name, file });
    }
  }

  const counts = { STAYED: 0, MOVED: 0, MODIFIED: 0, MISSING: 0, DUPLICATE: 0 };
  for (const f of findings) counts[f.verdict] += 1;
  return { findings, added, counts, baseDeclCount: base.size };
}

// ------------------------------------------------------------------ 실행부

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const VERBOSE = argv.includes("--verbose");
const SELF_TEST = argv.includes("--self-test");
const BASE_REF = flag("--base") ?? "origin/main";

const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/** run.ts + base ref에 없던 신규 파일. 근거는 Inputs.currentFiles 주석 참조. */
function collectScopeFiles(baseFilePaths: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && !baseFilePaths.has(p)) {
        out.set(p, fs.readFileSync(p, "utf8"));
      }
    }
  };
  walk(SCAN_ROOT);
  if (!fs.existsSync(RUN_TS)) throw new Error(`대상 파일 없음: ${RUN_TS} (repo 루트에서 실행하라)`);
  out.set(RUN_TS, fs.readFileSync(RUN_TS, "utf8"));
  return out;
}

/**
 * negative control — 검사기가 공허하게 통과하지 않음을 증명한다.
 * 실제 판정 경로(analyze)를 그대로 태우고, 각 위반이 실제로 잡히는지 확인한다.
 */
function selfTest(): number {
  const BODY = [
    "const helper = (a: string, b: number): string => {",
    "  const joined = `${a}:${b}`;",
    "  return joined.trim();",
    "};",
  ].join("\n");
  const baseRun = `${BODY}\n\nconst kept = 1;\n`;
  const baseFiles = new Set([RUN_TS]);

  interface Case {
    readonly label: string;
    readonly files: Map<string, string>;
    readonly expect: (r: Report) => boolean;
  }
  const dest = "src/core-runtime/reconstruct/moved.ts";
  const cases: Case[] = [
    {
      label: "이동 + export 추가 → MOVED (허용된 유일한 변경)",
      files: new Map([[RUN_TS, "const kept = 1;\n"], [dest, `export ${BODY}\n`]]),
      expect: (r) => r.counts.MOVED === 1 && r.counts.STAYED === 1 && r.counts.MODIFIED === 0,
    },
    {
      label: "본문 한 글자 변경 → MODIFIED (negative control)",
      files: new Map([[RUN_TS, "const kept = 1;\n"], [dest, `export ${BODY.replace("trim()", "trimEnd()")}\n`]]),
      expect: (r) => r.counts.MODIFIED === 1 && r.counts.MOVED === 0,
    },
    {
      label: "공백 한 칸 변경 → MODIFIED (negative control)",
      files: new Map([[RUN_TS, "const kept = 1;\n"], [dest, `export ${BODY.replace("(a: string,", "(a: string ,")}\n`]]),
      expect: (r) => r.counts.MODIFIED === 1,
    },
    {
      label: "잔류분 변형 → MODIFIED (잔류도 검사 대상)",
      files: new Map([[RUN_TS, "const kept = 2;\n"], [dest, `export ${BODY}\n`]]),
      expect: (r) => r.counts.MODIFIED === 1 && r.counts.STAYED === 0,
    },
    {
      label: "심볼 증발 → MISSING",
      files: new Map([[RUN_TS, "const kept = 1;\n"]]),
      expect: (r) => r.counts.MISSING === 1,
    },
    {
      label: "양쪽에 남음 → DUPLICATE",
      files: new Map([[RUN_TS, `${BODY}\n\nconst kept = 1;\n`], [dest, `export ${BODY}\n`]]),
      expect: (r) => r.counts.DUPLICATE === 1,
    },
    {
      label: "신규 파일에 없던 선언 → ADDED",
      files: new Map([[RUN_TS, "const kept = 1;\n"], [dest, `export ${BODY}\n\nexport const invented = 9;\n`]]),
      expect: (r) => r.added.length === 1 && r.added[0]?.name === "invented",
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const report = analyze({ baseRunText: baseRun, currentFiles: c.files, baseFilePaths: baseFiles });
    const ok = c.expect(report);
    if (!ok) failed += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.label}`);
    if (!ok) console.log(`        실제: ${JSON.stringify(report.counts)} added=${report.added.length}`);
  }
  console.log(`\n자기검사 ${cases.length - failed}/${cases.length} 통과`);
  return failed === 0 ? 0 : 1;
}

if (SELF_TEST) {
  console.log("=== 검사기 자기검사 (negative control 포함) ===");
  process.exit(selfTest());
}

const baseRunText = git("show", `${BASE_REF}:${RUN_TS}`);
const baseFilePaths = new Set(
  git("ls-tree", "-r", "--name-only", BASE_REF).split("\n").filter((l) => l.length > 0),
);
const currentFiles = collectScopeFiles(baseFilePaths);
const report = analyze({ baseRunText, currentFiles, baseFilePaths });

const sha = (s: string): string =>
  execFileSync("shasum", ["-a", "256"], { input: s, encoding: "utf8" }).slice(0, 12);

const destFiles = [...currentFiles.keys()].filter((f) => f !== RUN_TS).sort();
console.log(`기준본  : ${BASE_REF}:${RUN_TS}`);
console.log(`          ${baseRunText.split("\n").length}줄 · sha256 ${sha(baseRunText)} · top-level 선언 ${report.baseDeclCount}개`);
console.log(`검사 범위: ${RUN_TS} + 신규 파일 ${destFiles.length}개`);
for (const f of destFiles) console.log(`          + ${f}`);
console.log("");

if (report.baseDeclCount === 0) {
  console.error("!! 기준본에서 선언을 하나도 못 읽었다 — 검사가 공허하다. base ref를 확인하라.");
  process.exit(1);
}

const c = report.counts;
console.log("=== 판정 ===");
console.log(`  STAYED   ${String(c.STAYED).padStart(4)}  run.ts 잔류 · 본문 동일`);
console.log(`  MOVED    ${String(c.MOVED).padStart(4)}  이동됨 · 본문 바이트 동일`);
console.log(`  MODIFIED ${String(c.MODIFIED).padStart(4)}  본문이 다르다`);
console.log(`  MISSING  ${String(c.MISSING).padStart(4)}  어디에도 없다`);
console.log(`  DUPLICATE${String(c.DUPLICATE).padStart(4)}  두 곳 이상에 있다`);
console.log(`  ADDED    ${String(report.added.length).padStart(4)}  신규 파일의 기준본-외 선언`);

const violations = report.findings.filter((f) => f.verdict !== "STAYED" && f.verdict !== "MOVED");
if (violations.length > 0) {
  console.log("\n=== 위반 상세 ===");
  for (const f of violations) {
    console.log(`\n  [${f.verdict}] ${f.name} (${f.lines}줄)${f.sites.length > 0 ? ` @ ${f.sites.join(", ")}` : ""}`);
    if (f.detail) console.log(`      ${f.detail}`);
    if (f.verdict === "MISSING") {
      console.log("      run.ts에도 신규 파일에도 없다 — 삭제됐거나, 기존 파일로 옮겼다");
      console.log("      (기존 파일 이동은 계획 밖이다. 의도한 것이면 검사 범위를 넓혀야 한다).");
    }
  }
}
if (report.added.length > 0) {
  console.log("\n=== 신규 선언 (이동이 아닌 새 로직) ===");
  for (const a of report.added) console.log(`  [ADDED] ${a.name} @ ${a.file}`);
}

if (VERBOSE) {
  const moved = report.findings.filter((f) => f.verdict === "MOVED");
  if (moved.length > 0) {
    console.log("\n=== 이동 확인된 심볼 ===");
    for (const f of moved.sort((a, b) => b.lines - a.lines)) {
      console.log(`  ${String(f.lines).padStart(5)}줄  ${f.name} → ${f.sites.join(", ")}`);
    }
  }
}

const failures = violations.length + report.added.length;
console.log("");
if (failures > 0) {
  console.error(`FAIL — 위반 ${failures}건. 순수 이동이 아니다.`);
  process.exit(1);
}
if (c.MOVED === 0) {
  console.error(
    "FAIL — 이동 확인된 심볼이 0개다. 검사 대상이 없는 상태의 '위반 0건'은 증명이 아니다\n" +
      "       (아직 추출 전이라면 정상 — 첫 추출 후 다시 실행하라).",
  );
  process.exit(1);
}
console.log(`PASS — ${c.MOVED}개 심볼이 바이트 동일하게 이동했고, 잔류 ${c.STAYED}개도 원문 그대로다.`);
