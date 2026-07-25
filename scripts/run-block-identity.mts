/**
 * runReconstruct 분해 블록 텍스트 동일성 검사기 — "추출한 블록의 본문이 원문과 같다"를 증명한다.
 *
 * 왜 별도 도구인가: `run-extraction-identity.mts`는 **top-level 선언**만 본다. runReconstruct
 * 분해는 함수 **내부의 닫힌 블록**을 함수로 빼내는 일이라 그 검사기가 볼 수 없다. 그리고 분해는
 * 순수 이동이 아니므로 기존 바이트 증명이 무효화된다 — 무효화 범위를 정확히 한정하는 게 이 도구다:
 *
 *   - **추출된 블록의 본문**은 파라미터 이름을 원래 지역 변수 이름과 똑같이 두면 슬라이스 그대로
 *     옮길 수 있다. 즉 여기서는 여전히 바이트 동일성을 요구할 수 있고, 이 도구가 그것을 증명한다.
 *   - 바이트 증명이 사라지는 곳은 `runReconstruct` 본문 하나(블록이 빠지고 호출문이 들어간 자리)다.
 *     그건 행동 등가 하니스가 담당한다(설계 §5.2).
 *
 * 들여쓰기만 정규화한다. 블록은 runReconstruct의 try 안(깊은 들여쓰기)에서 새 함수 본문(얕은
 * 들여쓰기)으로 옮겨가므로 공통 선행 공백을 양쪽에서 벗겨낸 뒤 **나머지는 엄격 비교**한다.
 *
 * 라인 범위 오기 방지: 각 항목은 `expectStartsWith`를 선언해야 하고, 기준본 슬라이스의 첫
 * 비어있지 않은 줄이 그것으로 시작하지 않으면 FAIL한다. 범위를 한 줄 밀려 적는 사고를 잡는다.
 *
 * 공허 통과 방지: 선언 목록이 비어 있으면 FAIL한다. 아직 아무것도 안 뺀 상태의 "위반 0건"은
 * 증명이 아니다.
 *
 * 실행:
 *   npx tsx scripts/run-block-identity.mts [--base <ref>] [--verbose]
 *   npx tsx scripts/run-block-identity.mts --self-test   # negative control 포함
 */
import ts from "typescript";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const RUN_TS = "src/core-runtime/reconstruct/run.ts";
/**
 * 분해 직전 커밋. 기준본이 고정돼야 라인 범위가 의미를 갖는다. `origin/main`을 쓰면 안 된다 —
 * 1~3차 추출로 run.ts가 크게 달라져 라인 범위가 전혀 다른 코드를 가리킨다.
 */
const DEFAULT_BASE_REF = "5aecae2";

/**
 * 추출 선언. **이 목록이 검사 계약이다** — 블록을 뺐으면 여기에 적어야 하고, 적지 않으면
 * 그 블록은 아무 증명도 받지 못한다.
 */
interface Extraction {
  /** 사람이 읽는 라벨(개념 이름). */
  readonly label: string;
  /** 기준본 run.ts의 1-기준 시작·끝 줄(양쪽 포함). */
  readonly baseStartLine: number;
  readonly baseEndLine: number;
  /** 기준본 슬라이스의 첫 비어있지 않은 줄이 이것으로 시작해야 한다(범위 오기 가드). */
  readonly expectStartsWith: string;
  readonly destFile: string;
  /** 목적지의 top-level 함수 이름. 그 함수 **본문**이 블록과 비교된다. */
  readonly destFunction: string;
}

const EXTRACTIONS: readonly Extraction[] = [
  // Tier 1 — 설계 §4 옵션 2. 싼 순서로 채워 넣는다.
];

// ---------------------------------------------------------------- 순수 핵심부

/** 비어있지 않은 줄들의 공통 선행 공백을 벗긴다. 빈 줄은 그대로 둔다. */
function dedent(text: string): string {
  const lines = text.split("\n");
  let min = Infinity;
  for (const l of lines) {
    if (l.trim().length === 0) continue;
    const m = /^[ \t]*/.exec(l);
    min = Math.min(min, (m?.[0] ?? "").length);
  }
  if (!Number.isFinite(min) || min === 0) return lines.map((l) => l.replace(/[ \t]+$/, "")).join("\n");
  return lines.map((l) => (l.trim().length === 0 ? "" : l.slice(min).replace(/[ \t]+$/, ""))).join("\n");
}

/** 목적지 파일에서 top-level 함수의 **본문**(중괄호 안) 원문을 뜬다. */
function functionBodyText(fileName: string, text: string, fnName: string): string | null {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  let found: string | null = null;
  const visit = (n: ts.Node): void => {
    if (found !== null) return;
    let body: ts.Block | undefined;
    if (ts.isFunctionDeclaration(n) && n.name?.text === fnName) body = n.body;
    else if (
      ts.isVariableStatement(n) && n.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === fnName,
      )
    ) {
      const init = n.declarationList.declarations[0]?.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && ts.isBlock(init.body)) {
        body = init.body;
      }
    }
    if (body) {
      const full = sf.getFullText();
      // 중괄호 안쪽만 (열린 `{` 다음 ~ 닫힌 `}` 전).
      found = full.slice(body.getStart(sf) + 1, body.getEnd() - 1);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

type BlockVerdict = "IDENTICAL" | "MODIFIED" | "DEST_FN_MISSING" | "RANGE_MISMATCH" | "RANGE_OUT_OF_BOUNDS";

interface BlockFinding {
  readonly label: string;
  readonly verdict: BlockVerdict;
  readonly lines: number;
  readonly detail?: string;
}

function firstDifference(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  if (i === n && a.length === b.length) return "차이 없음";
  const line = a.slice(0, i).split("\n").length;
  const show = (s: string): string => JSON.stringify(s.slice(Math.max(0, i - 30), i + 40));
  return `블록 내부 ${line}번째 줄 부근\n      기준본: ${show(a)}\n      현재  : ${show(b)}`;
}

interface Inputs {
  readonly baseRunText: string;
  /** 목적지 파일 경로 → 원문. */
  readonly destTexts: ReadonlyMap<string, string>;
  readonly extractions: readonly Extraction[];
}

function analyze(input: Inputs): BlockFinding[] {
  const baseLines = input.baseRunText.split("\n");
  const out: BlockFinding[] = [];
  for (const ex of input.extractions) {
    if (ex.baseStartLine < 1 || ex.baseEndLine > baseLines.length || ex.baseStartLine > ex.baseEndLine) {
      out.push({
        label: ex.label,
        verdict: "RANGE_OUT_OF_BOUNDS",
        lines: 0,
        detail: `기준본은 ${baseLines.length}줄인데 범위가 L${ex.baseStartLine}-L${ex.baseEndLine}이다`,
      });
      continue;
    }
    const slice = baseLines.slice(ex.baseStartLine - 1, ex.baseEndLine).join("\n");
    const firstNonBlank = slice.split("\n").find((l) => l.trim().length > 0) ?? "";
    if (!firstNonBlank.trim().startsWith(ex.expectStartsWith)) {
      out.push({
        label: ex.label,
        verdict: "RANGE_MISMATCH",
        lines: ex.baseEndLine - ex.baseStartLine + 1,
        detail: `첫 줄이 ${JSON.stringify(ex.expectStartsWith)}로 시작해야 하는데 ${JSON.stringify(firstNonBlank.trim().slice(0, 70))}이다`,
      });
      continue;
    }
    const destText = input.destTexts.get(ex.destFile);
    const body = destText === undefined ? null : functionBodyText(ex.destFile, destText, ex.destFunction);
    if (body === null) {
      out.push({
        label: ex.label,
        verdict: "DEST_FN_MISSING",
        lines: ex.baseEndLine - ex.baseStartLine + 1,
        detail: `${ex.destFile}에서 함수 '${ex.destFunction}'을 못 찾았다 — 코드가 또 움직였으면 목록을 따라가라`,
      });
      continue;
    }
    const want = dedent(slice).trim();
    const got = dedent(body).trim();
    out.push(
      want === got
        ? { label: ex.label, verdict: "IDENTICAL", lines: ex.baseEndLine - ex.baseStartLine + 1 }
        : {
          label: ex.label,
          verdict: "MODIFIED",
          lines: ex.baseEndLine - ex.baseStartLine + 1,
          detail: firstDifference(want, got),
        },
    );
  }
  return out;
}

// ------------------------------------------------------------------ 자기검사

function selfTest(): number {
  const BLOCK = [
    "      const a = compute(1);",
    "      if (a > 0) {",
    "        await write(a);",
    "      }",
  ].join("\n");
  const baseRun = ["function outer() {", "  try {", BLOCK, "  } catch {}", "}", ""].join("\n");
  const start = 3;
  const end = 6;
  const dest = "src/core-runtime/reconstruct/dest.ts";
  const wrap = (body: string): string => `export async function phase(): Promise<void> {\n${body}\n}\n`;
  const base: Extraction = {
    label: "t",
    baseStartLine: start,
    baseEndLine: end,
    expectStartsWith: "const a = compute(1);",
    destFile: dest,
    destFunction: "phase",
  };

  interface Case {
    readonly label: string;
    readonly ex: Extraction;
    readonly destBody: string;
    readonly expect: (f: BlockFinding) => boolean;
  }
  const cases: Case[] = [
    {
      label: "들여쓰기만 바뀐 동일 블록 → IDENTICAL (허용된 유일한 변경)",
      ex: base,
      destBody: BLOCK.split("\n").map((l) => l.replace(/^ {6}/, "  ")).join("\n"),
      expect: (f) => f.verdict === "IDENTICAL",
    },
    {
      label: "본문 한 글자 변경 → MODIFIED (negative control)",
      ex: base,
      destBody: BLOCK.replace("compute(1)", "compute(2)"),
      expect: (f) => f.verdict === "MODIFIED",
    },
    {
      label: "공백 한 칸 추가 → MODIFIED (negative control)",
      ex: base,
      destBody: BLOCK.replace("a > 0", "a  > 0"),
      expect: (f) => f.verdict === "MODIFIED",
    },
    {
      label: "한 줄 누락 → MODIFIED (negative control)",
      ex: base,
      destBody: BLOCK.split("\n").filter((l) => !l.includes("await write")).join("\n"),
      expect: (f) => f.verdict === "MODIFIED",
    },
    {
      label: "목적지 함수 이름이 다르면 → DEST_FN_MISSING (소리내어 실패)",
      ex: { ...base, destFunction: "notThere" },
      destBody: BLOCK,
      expect: (f) => f.verdict === "DEST_FN_MISSING",
    },
    {
      label: "라인 범위를 한 줄 밀면 → RANGE_MISMATCH (범위 오기 가드)",
      ex: { ...base, baseStartLine: start + 1 },
      destBody: BLOCK,
      expect: (f) => f.verdict === "RANGE_MISMATCH",
    },
    {
      label: "범위가 파일을 넘으면 → RANGE_OUT_OF_BOUNDS",
      ex: { ...base, baseEndLine: 9999 },
      destBody: BLOCK,
      expect: (f) => f.verdict === "RANGE_OUT_OF_BOUNDS",
    },
  ];

  console.log("=== 블록 검사기 자기검사 (negative control 포함) ===");
  let failed = 0;
  for (const c of cases) {
    const findings = analyze({
      baseRunText: baseRun,
      destTexts: new Map([[dest, wrap(c.destBody)]]),
      extractions: [c.ex],
    });
    const f = findings[0] as BlockFinding;
    const ok = c.expect(f);
    if (!ok) failed += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.label}`);
    if (!ok) console.log(`        실제: ${f.verdict}${f.detail ? ` — ${f.detail.split("\n")[0]}` : ""}`);
  }
  console.log(`\n자기검사 ${cases.length - failed}/${cases.length} 통과`);
  return failed === 0 ? 0 : 1;
}

// ------------------------------------------------------------------ 실행부

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const VERBOSE = argv.includes("--verbose");
if (argv.includes("--self-test")) process.exit(selfTest());

const BASE_REF = flag("--base") ?? DEFAULT_BASE_REF;
const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

if (EXTRACTIONS.length === 0) {
  console.error(
    "!! EXTRACTIONS가 비어 있다 — 아직 아무 블록도 선언되지 않았다.\n" +
      "   블록을 뺐으면 이 목록에 적어라. 빈 목록의 '위반 0건'은 증명이 아니다.",
  );
  process.exit(1);
}

const baseRunText = git("show", `${BASE_REF}:${RUN_TS}`);
if (baseRunText.split("\n").length < 100) {
  throw new Error(`기준본이 비정상적으로 짧다(${baseRunText.split("\n").length}줄) — base ref를 확인하라`);
}
const destTexts = new Map<string, string>();
for (const ex of EXTRACTIONS) {
  if (destTexts.has(ex.destFile)) continue;
  if (!fs.existsSync(ex.destFile)) throw new Error(`목적지 파일 없음: ${ex.destFile}`);
  destTexts.set(ex.destFile, fs.readFileSync(ex.destFile, "utf8"));
}

const findings = analyze({ baseRunText, destTexts, extractions: EXTRACTIONS });
const sha = (s: string): string =>
  execFileSync("shasum", ["-a", "256"], { input: s, encoding: "utf8" }).slice(0, 12);

console.log(`기준본  : ${BASE_REF}:${RUN_TS}`);
console.log(`          ${baseRunText.split("\n").length}줄 · sha256 ${sha(baseRunText)}`);
console.log(`선언된 추출: ${EXTRACTIONS.length}개\n`);

const okCount = findings.filter((f) => f.verdict === "IDENTICAL").length;
const bad = findings.filter((f) => f.verdict !== "IDENTICAL");
for (const f of findings) {
  if (f.verdict === "IDENTICAL" && !VERBOSE) continue;
  console.log(`  [${f.verdict}] ${f.label} (${f.lines}줄)`);
  if (f.detail) console.log(`      ${f.detail}`);
}
console.log(`\n=== 판정 ===`);
console.log(`  IDENTICAL ${String(okCount).padStart(3)}  블록 본문이 기준본과 바이트 동일(들여쓰기만 정규화)`);
console.log(`  위반      ${String(bad.length).padStart(3)}`);
if (bad.length > 0) {
  console.error(`\nFAIL — 위반 ${bad.length}건. 추출된 블록이 원문과 다르다.`);
  process.exit(1);
}
console.log(`\nPASS — ${okCount}개 블록이 기준본과 바이트 동일하다.`);
console.log(
  "주의: 이 도구는 **추출된 블록**만 증명한다. runReconstruct 본문(블록이 빠지고 호출문이 들어간 자리)의\n" +
    "      행동 동일성은 등가 하니스가 담당한다(설계 §5.2).",
);
