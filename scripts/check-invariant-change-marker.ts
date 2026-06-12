/**
 * G4 — 보호 키 변경 감지 (INV-AUTH-1, INV-CFG-1, INV-MATERIAL-1).
 *
 * base..HEAD diff에 보호 키 변경이 있는데 커밋 메시지에
 * `INVARIANT-CHANGE: <INV-ID>` 표식이 없으면 실패한다.
 *
 * 보호 대상 (structural-guardrails-enforcement.md G4):
 *  - .onto/settings.json 의 auth/provider/model/effort 키 라인
 *  - .onto/processes/review/material-issue-contract.md 전체 (material 정의)
 *  - src/core-runtime/llm/model-switcher.ts 의 auth 정규화 return 라인
 *
 * 사용: npx tsx scripts/check-invariant-change-marker.ts [baseRef]
 *  - baseRef 기본값: origin/main (CI에서는 PR base ref를 넘긴다)
 * npm: `check:invariant-change`
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

interface ProtectedTarget {
  file: string;
  /** null이면 파일의 어떤 변경이든 보호 대상. */
  linePattern: RegExp | null;
  invariants: string[];
}

const PROTECTED_TARGETS: ProtectedTarget[] = [
  {
    file: ".onto/settings.json",
    linePattern: /"(auth|provider|model|effort)"\s*:/,
    invariants: ["INV-AUTH-1", "INV-CFG-1"],
  },
  {
    file: ".onto/processes/review/material-issue-contract.md",
    linePattern: null,
    invariants: ["INV-MATERIAL-1"],
  },
  {
    file: "src/core-runtime/llm/model-switcher.ts",
    linePattern: /return\s+"(oauth|api_key|local)"/,
    invariants: ["INV-AUTH-1"],
  },
];

const MARKER_RE = /INVARIANT-CHANGE:\s*\S+/;

async function git(args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: PROJECT_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.stdout;
}

async function main(): Promise<void> {
  const baseRef = process.argv[2] ?? "origin/main";
  let mergeBase: string;
  try {
    mergeBase = (await git(["merge-base", baseRef, "HEAD"])).trim();
  } catch {
    console.error(`[check:invariant-change] base ref not found: ${baseRef}`);
    process.exit(2);
  }

  const touched: Array<{ target: ProtectedTarget; line: string }> = [];
  for (const target of PROTECTED_TARGETS) {
    const diff = await git([
      "diff",
      "--unified=0",
      "--no-color",
      `${mergeBase}..HEAD`,
      "--",
      target.file,
    ]);
    if (diff.trim().length === 0) continue;
    const changedLines = diff
      .split("\n")
      .filter(
        (line) =>
          (line.startsWith("+") || line.startsWith("-")) &&
          !line.startsWith("+++") &&
          !line.startsWith("---"),
      );
    const matches =
      target.linePattern === null
        ? changedLines
        : changedLines.filter((line) => target.linePattern!.test(line));
    for (const line of matches.slice(0, 5)) {
      touched.push({ target, line });
    }
  }

  if (touched.length === 0) {
    console.log(
      JSON.stringify(
        {
          check: "invariant-change",
          status: "passed",
          base: baseRef,
          protected_changes: 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  const log = await git(["log", "--format=%B", `${mergeBase}..HEAD`]);
  if (MARKER_RE.test(log)) {
    console.log(
      JSON.stringify(
        {
          check: "invariant-change",
          status: "passed",
          base: baseRef,
          protected_changes: touched.length,
          marker: log.match(MARKER_RE)![0],
        },
        null,
        2,
      ),
    );
    return;
  }

  console.error(
    "[check:invariant-change] FAIL — protected key changes without an INVARIANT-CHANGE marker",
  );
  for (const { target, line } of touched) {
    console.error(
      `  ${target.file} (${target.invariants.join(", ")}): ${line.slice(0, 120)}`,
    );
  }
  console.error(
    '  add "INVARIANT-CHANGE: <INV-ID> — <사유>" to a commit message after user confirmation (AGENTS §0-2).',
  );
  process.exit(1);
}

await main();
