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
 *  - .onto/authority/supported-models.yaml 의 context_window_tokens 라인 (INV-MODEL-1)
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
    // auth 리터럴이 닿는 모든 라인 — 정규화 return뿐 아니라 주변 provider
    // 조건 변경(어느 provider가 OAuth 기본인지)도 보호한다.
    file: "src/core-runtime/llm/model-switcher.ts",
    linePattern: /"(oauth|api_key|local)"/,
    invariants: ["INV-AUTH-1"],
  },
  {
    // INVARIANTS.md가 지정한 runtime predicate owner — material 판정 어휘
    // (snake/camel/UPPER 표기 전부: REVIEW_MATERIAL_SEVERITIES,
    // REVIEW_MATERIAL_ADMISSION_DISQUALIFIERS, isReviewMaterialAdmissionDisqualified).
    file: "src/core-runtime/review/review-result-classification.ts",
    linePattern: /MATERIAL_SEVERIT|admission.?disqualif/i,
    invariants: ["INV-MATERIAL-1"],
  },
  {
    // settings 수용 스키마와 chain 완성 기본값 (AGENTS §0-2: 스키마 변경은 확인 필수).
    file: "src/core-runtime/discovery/settings-chain.ts",
    linePattern: /Schema\b|max_retries|retry_initial_delay_ms/,
    invariants: ["INV-CFG-1"],
  },
  {
    // G2 waiver 표 — 하드코딩 인가 권위 자체의 변경도 마커를 요구한다.
    file: "scripts/check-no-hardcoded-spec-defaults.ts",
    linePattern: /\b(file|linePattern|reason):/,
    invariants: ["INV-CFG-1", "INV-AUTH-1"],
  },
  {
    // 모델 context window 값 — reconstruct projection 예산의 SSOT. window 필드
    // 변경만 보호한다(일반 모델 추가·다른 필드 편집엔 friction 없음).
    file: ".onto/authority/supported-models.yaml",
    linePattern: /context_window_tokens/,
    invariants: ["INV-MODEL-1"],
  },
];

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
  // 마커는 닿은 불변식과 일치해야 한다 — 임의의 INVARIANT-CHANGE 문자열이
  // 다른 보호 대상의 변경까지 승인하지 못하게 한다.
  const markerInvariantIds = new Set(
    [...log.matchAll(/INVARIANT-CHANGE:[^\n]*/g)].flatMap((marker) =>
      [...marker[0].matchAll(/INV-[A-Z]+-\d+/g)].map((id) => id[0]),
    ),
  );
  const unauthorized = touched.filter(
    ({ target }) => !target.invariants.some((id) => markerInvariantIds.has(id)),
  );
  if (unauthorized.length === 0) {
    console.log(
      JSON.stringify(
        {
          check: "invariant-change",
          status: "passed",
          base: baseRef,
          protected_changes: touched.length,
          marker_invariants: [...markerInvariantIds],
        },
        null,
        2,
      ),
    );
    return;
  }

  console.error(
    "[check:invariant-change] FAIL — protected key changes without a matching INVARIANT-CHANGE marker",
  );
  for (const { target, line } of unauthorized) {
    console.error(
      `  ${target.file} (requires one of: ${target.invariants.join(", ")}): ${line.slice(0, 120)}`,
    );
  }
  if (markerInvariantIds.size > 0) {
    console.error(
      `  markers found but for different invariants: ${[...markerInvariantIds].join(", ")}`,
    );
  }
  console.error(
    '  add "INVARIANT-CHANGE: <INV-ID> — <사유>" (해당 불변식 id 포함) to a commit message after user confirmation (AGENTS §0-2).',
  );
  process.exit(1);
}

await main();
