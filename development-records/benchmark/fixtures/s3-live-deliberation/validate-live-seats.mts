/**
 * S3 live 심의 seat 사후(deep) 재검증 — P1 교정 경로.
 *
 * B의 advance 게이트는 심의 seat에 대해 얕은 검증(존재·비공백)이고, 교차
 * 메시지로 advance 이후 seat가 보강된 사례가 관찰되었다. 따라서 "최종
 * 바이트"가 controlled 경로의 deep validator를 통과하는지 여기서 직접
 * 검증하고 결과를 evidence로 남긴다. 사용:
 *   npx tsx development-records/benchmark/fixtures/s3-live-deliberation/validate-live-seats.mts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const LIVE = path.join(HERE, "evidence/live-20260611-bad3651a");
const SESSION_ID = "20260611-bad3651a";

const { validateIssueDeliberationResponseObject } = await import(
  pathToFileURL(
    path.join(REPO_ROOT, "src/core-runtime/review/controlled-lens-deliberation.ts"),
  ).href
);

async function readYaml(p: string): Promise<unknown> {
  return YAML.parse(await fs.readFile(p, "utf8"));
}

const results: Array<Record<string, unknown>> = [];
const responsesRoot = path.join(LIVE, "deliberation-responses");
for (const issueDir of (await fs.readdir(responsesRoot)).sort()) {
  for (const file of (await fs.readdir(path.join(responsesRoot, issueDir))).sort()) {
    const lensId = file.replace(/\.yaml$/, "");
    const seatPath = path.join(responsesRoot, issueDir, file);
    try {
      validateIssueDeliberationResponseObject({
        parsed: await readYaml(seatPath),
        sessionId: SESSION_ID,
        issueId: issueDir,
        lensId,
        // allowedEvidenceRefs는 packet 권위 — evidence 번들에 packet을 포함하지
        // 않으므로 여기서는 스키마·정합 검증까지만 수행한다(명시 한계).
      });
      results.push({ unit: `deliberation:${issueDir}:${lensId}`, status: "passed" });
      console.log(`PASS deliberation:${issueDir}:${lensId}`);
    } catch (error) {
      results.push({
        unit: `deliberation:${issueDir}:${lensId}`,
        status: "failed",
        error: (error as Error).message,
      });
      console.log(`FAIL deliberation:${issueDir}:${lensId} — ${(error as Error).message}`);
    }
  }
}

const out = {
  purpose:
    "post-hoc deep re-validation of FINAL live deliberation seat bytes (advance gate is shallow for deliberation seats; two seats were enriched after advance)",
  validator: "validateIssueDeliberationResponseObject (same deep validator as the controlled path)",
  limit: "allowedEvidenceRefs check skipped (packet authority not bundled in evidence)",
  results,
};
await fs.writeFile(
  path.join(LIVE, "seat-revalidation.yaml"),
  YAML.stringify(out),
  "utf8",
);
console.log(`\n결과: ${results.filter((r) => r.status === "passed").length}/${results.length} passed → evidence/live-*/seat-revalidation.yaml`);
