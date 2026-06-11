/**
 * S3 2차 — 3 arm 심의 seat 인스턴스 대조 검증 (커밋된 evidence 기준, 재현 가능).
 *
 * 세 arm(flat+peer live / flat+teamlead+peer live / controlled packet-임베드)의
 * 모든 issue-deliberation-response 최종 바이트를 동일 deep validator로 검증하고
 * changed 패턴을 집계한다. 사용:
 *   npx tsx development-records/benchmark/fixtures/s3-live-deliberation/validate-contrast-seats.mts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const { validateIssueDeliberationResponseObject } = await import(
  pathToFileURL(
    path.join(REPO_ROOT, "src/core-runtime/review/controlled-lens-deliberation.ts"),
  ).href
);

const ARMS: Array<[string, string, string]> = [
  ["live(flat+peer)", "evidence/live-20260611-bad3651a", "20260611-bad3651a"],
  ["live(flat+teamlead+peer)", "evidence/teamlead-20260611-24c15f0c", "20260611-24c15f0c"],
  ["controlled(packet-embed)", "evidence/controlled2-20260611-732cebe9", "20260611-732cebe9"],
];

const summary: Array<Record<string, unknown>> = [];
for (const [label, rel, sid] of ARMS) {
  const respRoot = path.join(HERE, rel, "deliberation-responses");
  let pass = 0;
  let fail = 0;
  let changed = 0;
  let total = 0;
  for (const issueDir of (await fs.readdir(respRoot)).sort()) {
    for (const file of (await fs.readdir(path.join(respRoot, issueDir))).sort()) {
      total += 1;
      const parsed = YAML.parse(
        await fs.readFile(path.join(respRoot, issueDir, file), "utf8"),
      ) as Record<string, unknown>;
      try {
        validateIssueDeliberationResponseObject({
          parsed,
          sessionId: sid,
          issueId: issueDir,
          lensId: file.replace(/\.yaml$/, ""),
        });
        pass += 1;
        if (parsed.changed === true) changed += 1;
      } catch (error) {
        fail += 1;
        console.log(
          `  FAIL ${label} ${issueDir}/${file}: ${(error as Error).message.slice(0, 120)}`,
        );
      }
    }
  }
  console.log(
    `${label}: seats=${total} deep-validator pass=${pass} fail=${fail} changed=true ${changed}/${total}`,
  );
  summary.push({ arm: label, seats: total, pass, fail, changed_true: changed });
}
await fs.writeFile(
  path.join(HERE, "contrast-seat-validation.yaml"),
  YAML.stringify({
    purpose:
      "instance-level deliberation seat contrast — same deep validator over final bytes of all three arms",
    validator: "validateIssueDeliberationResponseObject",
    arms: summary,
  }),
  "utf8",
);
console.log("결과: contrast-seat-validation.yaml");
