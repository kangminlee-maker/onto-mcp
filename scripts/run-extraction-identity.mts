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
  /**
   * append 목적지(base에 이미 있던 모듈) → **base 시점에 그 파일이 갖고 있던** 선언 이름들.
   * 색인에서 제외해 이 추출과 무관한 동명이인이 DUPLICATE 오탐이 되지 않게 한다.
   */
  readonly appendDestBaseDeclNames: ReadonlyMap<string, ReadonlySet<string>>;
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
    // append 목적지는 base에 이미 있던 모듈이다. 그 모듈이 **원래부터** 갖고 있던 선언은
    // 이 추출과 무관하므로 색인에서 뺀다. 넣으면 run.ts 잔류 심볼과 동명인 파일-로컬
    // 헬퍼가 DUPLICATE 오탐이 된다(Inputs.currentFiles 주석의 그 위험).
    const preExisting = input.appendDestBaseDeclNames.get(file);
    for (const decl of declarationsOf(file, text)) {
      if (preExisting?.has(decl.name)) continue;
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

/**
 * base ref에 **이미 있던** 모듈 중, 3차 추출이 심볼을 덧붙인 곳(커터 `--append`).
 *
 * concept economy 때문에 필요하다: 옮길 심볼이 이미 존재하는 개념에 속하면 옆에 근접 중복
 * 모듈을 만들지 않고 그 모듈로 들어간다. 그러면 신규-파일 기준 범위로는 검사기가 그 선언을
 * 찾지 못해 MISSING으로 뜬다(= 이 목록이 없으면 정직하게 실패한다).
 *
 * **열거를 유지하고 전체 스캔으로 바꾸지 말 것** — Inputs.currentFiles 주석의 이유대로
 * src/ 전체를 훑으면 파일-로컬 동명이인(`isoNow`·`isRecord`·`stableJson` …) 때문에 추출 전
 * 상태에서 이미 DUPLICATE 20건이 뜬다. 여기 적은 파일마다 "이동해온 선언이 실제로 있는가"를
 * 아래에서 검사하므로, 코드가 또 움직이면 목록을 따라가라고 소리내어 실패한다.
 */
/**
 * **분해된** 선언 — 이 검사기의 바이트 증명 대상에서 명시적으로 빠지는 것.
 *
 * `runReconstruct` 분해(설계 20260726)는 순수 이동이 아니다. 닫힌 블록이 함수로 빠져나가고 그
 * 자리에 호출문이 들어가므로 **이 함수의 선언 본문은 필연적으로 달라진다**. 증명이 사라지는 게
 * 아니라 담당이 바뀐다:
 *   - 추출된 블록 본문의 바이트 동일성 → `scripts/run-block-identity.mts`
 *   - 래퍼(호출문이 들어간 자리)의 행동 동일성 → `scripts/run-reconstruct-equivalence.mts`
 *
 * 아래 가드가 이 목록의 남용을 막는다: 여기 적힌 이름이 실제로는 MODIFIED가 아니면(=아직
 * 분해되지 않았거나 되돌려졌다면) FAIL한다. 면제가 조용히 넓어지거나 스테일해지지 않는다.
 */
const DECOMPOSED_DECLARATIONS = ["runReconstruct"];

/**
 * **분해 래퍼** — 추출된 블록을 감싸는 새 함수. 기준본에 없으니 이 검사기에는 ADDED로 보이고,
 * 그건 정확한 판정이다(래퍼 자체는 새 코드다). 하지만 래퍼 **안의 블록**은 바이트 동일하며
 * 그 증명은 `scripts/run-block-identity.mts`가 한다.
 *
 * 남용을 기계적으로 막는다:
 *   1) 여기 적힌 이름이 실제로 ADDED가 아니면 FAIL(스테일·과다 선언).
 *   2) 여기 적힌 이름이 블록 검사기의 `destFunction`으로 **선언돼 있지 않으면** FAIL. 즉 블록
 *      증명 없이 ADDED 면제를 받는 경로가 없다.
 */
const DECOMPOSITION_WRAPPERS = ["emitEnvironmentContextProfile", "repairInvalidOntologySeed"];
const BLOCK_IDENTITY_SCRIPT = "scripts/run-block-identity.mts";

const APPEND_DEST_REFS = [
  "src/core-runtime/reconstruct/contract-registry.ts",
  "src/core-runtime/reconstruct/environment-context-profile.ts",
  "src/core-runtime/reconstruct/ontology-seed-validation.ts",
  "src/core-runtime/reconstruct/post-seed-validation.ts",
  "src/core-runtime/reconstruct/record.ts",
  "src/core-runtime/reconstruct/source-observations.ts",
];

/** run.ts + base ref에 없던 신규 파일 + APPEND_DEST_REFS. 근거는 Inputs.currentFiles 주석 참조. */
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
  for (const ref of APPEND_DEST_REFS) {
    if (!fs.existsSync(ref)) throw new Error(`APPEND_DEST_REFS에 없는 파일: ${ref}`);
    out.set(ref, fs.readFileSync(ref, "utf8"));
  }
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
    /** base ref에 있던 파일 집합. 생략하면 run.ts만. */
    readonly baseFiles?: ReadonlySet<string>;
    /** append 목적지 → base 시점 선언 이름. 생략하면 없음. */
    readonly appendBase?: ReadonlyMap<string, ReadonlySet<string>>;
    readonly expect: (r: Report) => boolean;
  }
  const dest = "src/core-runtime/reconstruct/moved.ts";
  const appendDest = "src/core-runtime/reconstruct/already-existing.ts";
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
    {
      // append 목적지의 base 시점 선언을 제외하지 않으면 동명이인이 DUPLICATE 오탐이 된다.
      label: "append 목적지의 base 선언은 색인 제외 → 동명이인이 DUPLICATE가 되지 않는다",
      files: new Map([[RUN_TS, `${BODY}\n\nconst kept = 1;\n`], [appendDest, "const helper = 0;\n"]]),
      baseFiles: new Set([RUN_TS, appendDest]),
      appendBase: new Map([[appendDest, new Set(["helper"])]]),
      expect: (r) => r.counts.DUPLICATE === 0 && r.counts.STAYED === 2,
    },
    {
      label: "append 목적지로 덧붙여진 선언은 MOVED로 잡힌다",
      files: new Map([[RUN_TS, "const kept = 1;\n"], [appendDest, `const own = 0;\n\nexport ${BODY}\n`]]),
      baseFiles: new Set([RUN_TS, appendDest]),
      appendBase: new Map([[appendDest, new Set(["own"])]]),
      expect: (r) => r.counts.MOVED === 1 && r.counts.MISSING === 0 && r.added.length === 0,
    },
    {
      // 제외가 지나쳐 append로 온 선언까지 가리면 증명이 뚫린다 — base에 있었다고 잘못 적으면 MISSING.
      label: "append 목적지 base 목록을 과하게 적으면 MISSING (제외가 만능이 아님을 고정)",
      files: new Map([[RUN_TS, "const kept = 1;\n"], [appendDest, `export ${BODY}\n`]]),
      baseFiles: new Set([RUN_TS, appendDest]),
      appendBase: new Map([[appendDest, new Set(["helper"])]]),
      expect: (r) => r.counts.MISSING === 1 && r.counts.MOVED === 0,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const report = analyze({
      baseRunText: baseRun,
      currentFiles: c.files,
      baseFilePaths: c.baseFiles ?? baseFiles,
      appendDestBaseDeclNames: c.appendBase ?? new Map(),
    });
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
const appendDestBaseDeclNames = new Map<string, ReadonlySet<string>>();
for (const ref of APPEND_DEST_REFS) {
  if (!baseFilePaths.has(ref)) {
    throw new Error(`APPEND_DEST_REFS 항목이 base ref에 없다(=신규 파일이므로 목록에서 빼라): ${ref}`);
  }
  const names = new Set(declarationsOf(ref, git("show", `${BASE_REF}:${ref}`)).map((d) => d.name));
  if (names.size === 0) throw new Error(`base 시점 선언을 하나도 못 읽었다: ${ref}`);
  appendDestBaseDeclNames.set(ref, names);
}
const report = analyze({ baseRunText, currentFiles, baseFilePaths, appendDestBaseDeclNames });

/**
 * 항목별 침식 가드. APPEND_DEST_REFS에 적힌 파일은 이번 추출로 선언을 **받았기 때문에** 적혀
 * 있다. 하나도 받지 않았다면 코드가 또 움직였거나(목록이 뒤처짐) 목록이 틀린 것이다. 2차에서
 * 게이트가 green인 채 커버리지를 잃은 것과 같은 유형이므로 조용히 넘기지 않는다.
 */
const landedByFile = new Map<string, number>();
for (const f of report.findings) {
  if (f.verdict !== "MOVED") continue;
  for (const s of f.sites) landedByFile.set(s, (landedByFile.get(s) ?? 0) + 1);
}
const barrenAppendDests = APPEND_DEST_REFS.filter((ref) => (landedByFile.get(ref) ?? 0) === 0);
if (barrenAppendDests.length > 0) {
  console.error(
    "!! APPEND_DEST_REFS에 적혀 있는데 이동해온 선언이 0개인 파일 — 목록이 코드를 따라가지 못했다:\n  " +
      barrenAppendDests.join("\n  "),
  );
  process.exit(1);
}

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

/**
 * 분해 면제 처리. 목록에 적힌 이름이 실제로 MODIFIED인지 **확인한 뒤** 위반에서 뺀다.
 * 적어놓고 실제로는 안 바뀐 것이 있으면(스테일·과다 선언) FAIL시킨다.
 */
const staleDecomposed = DECOMPOSED_DECLARATIONS.filter(
  (name) => !report.findings.some((f) => f.name === name && f.verdict === "MODIFIED"),
);
if (staleDecomposed.length > 0) {
  console.error(
    `\n!! DECOMPOSED_DECLARATIONS에 적혀 있는데 MODIFIED가 아니다 — 면제가 스테일하거나 과다 선언이다:\n  ` +
      staleDecomposed.join("\n  ") +
      `\n   분해가 되돌려졌으면 목록에서 빼라. 면제는 실제로 분해된 것에만 붙는다.`,
  );
  process.exit(1);
}
const decomposedExempt = new Set(DECOMPOSED_DECLARATIONS);
const violations = report.findings.filter(
  (f) => f.verdict !== "STAYED" && f.verdict !== "MOVED" && !decomposedExempt.has(f.name),
);

// 분해 래퍼 면제 — (1) 실제로 ADDED인가 (2) 블록 검사기에 선언돼 있는가, 둘 다 확인한다.
if (DECOMPOSITION_WRAPPERS.length > 0) {
  const blockScript = fs.existsSync(BLOCK_IDENTITY_SCRIPT)
    ? fs.readFileSync(BLOCK_IDENTITY_SCRIPT, "utf8")
    : "";
  if (blockScript.length === 0) {
    console.error(`\n!! ${BLOCK_IDENTITY_SCRIPT}를 읽을 수 없다 — 래퍼 면제를 검증할 수 없다.`);
    process.exit(1);
  }
  const wrapperProblems: string[] = [];
  for (const name of DECOMPOSITION_WRAPPERS) {
    if (!report.added.some((a) => a.name === name)) {
      wrapperProblems.push(`${name}: ADDED가 아니다 — 면제가 스테일하거나 과다 선언이다`);
    }
    if (!blockScript.includes(`destFunction: "${name}"`)) {
      wrapperProblems.push(
        `${name}: ${BLOCK_IDENTITY_SCRIPT}의 destFunction으로 선언돼 있지 않다 — 블록 증명 없는 면제는 허용하지 않는다`,
      );
    }
  }
  if (wrapperProblems.length > 0) {
    console.error(`\n!! DECOMPOSITION_WRAPPERS 검증 실패 ${wrapperProblems.length}건:\n  ${wrapperProblems.join("\n  ")}`);
    process.exit(1);
  }
}
const wrapperExempt = new Set(DECOMPOSITION_WRAPPERS);
const addedViolations = report.added.filter((a) => !wrapperExempt.has(a.name));
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
  for (const a of report.added) {
    const exempt = wrapperExempt.has(a.name) ? " [분해 래퍼 — 블록 증명은 run-block-identity]" : "";
    console.log(`  [ADDED] ${a.name} @ ${a.file}${exempt}`);
  }
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

const failures = violations.length + addedViolations.length;
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
