/**
 * 영속화된 온톨로지 리뷰 evidence에 semantic quality gate를 적용한다.
 *
 * 각 fixture의 semantic-expectations.yaml(ground-truth 도출 기대값)을 주입해
 * 코드 fixture preset 없이 gate를 평가한다 — gate 비코드 일반화 검증 경로.
 * 사용:
 *   npx tsx development-records/benchmark/fixtures/ontology/evaluate-semantic-gate.mts [fixtureId[:sessionId] ...]
 *
 * `fixtureId:sessionId`로 세션을 고정하면 git이 보존하지 않는 mtime에 의존하지
 * 않고 재현 가능하다. sessionId 생략 시 mtime 최신 run을 고른다(탐색용).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const FIXTURES_ROOT = path.join(
  REPO_ROOT,
  "development-records/benchmark/fixtures/ontology",
);
const FIXTURE_IDS = [
  "clinical-lab-workflow",
  "credit-risk-taxonomy",
  "manufacturing-bom",
];

async function readYaml(filePath: string): Promise<unknown> {
  return YAML.parse(await fs.readFile(filePath, "utf8"));
}

async function readOptionalYaml(filePath: string): Promise<unknown> {
  try {
    return await readYaml(filePath);
  } catch {
    return undefined;
  }
}

function requireStrings(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`semantic-expectations.${key} must be a string list`);
  }
  return value as string[];
}

/** material_terms 항목: 문자열 또는 동의어 그룹(any-of 문자열 배열). */
function requireTermGroups(value: unknown, key: string): Array<string | string[]> {
  const valid = Array.isArray(value) &&
    value.every((item) =>
      typeof item === "string" ||
      (Array.isArray(item) && item.length > 0 &&
        item.every((alt) => typeof alt === "string")),
    );
  if (!valid) {
    throw new Error(
      `semantic-expectations.${key} must be a list of strings or non-empty string groups`,
    );
  }
  return value as Array<string | string[]>;
}

function requireString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`semantic-expectations.${key} must be a non-empty string`);
  }
  return value;
}

async function loadExpectations(fixtureId: string) {
  const raw = (await readYaml(
    path.join(FIXTURES_ROOT, fixtureId, "semantic-expectations.yaml"),
  )) as Record<string, unknown>;
  const materialTerms = requireTermGroups(raw.material_terms, "material_terms");
  if (materialTerms.length === 0) {
    // 빈 리스트면 recall 체크가 공허 통과한다 — boundary decoy 리스트와 달리 비허용.
    throw new Error("semantic-expectations.material_terms must not be empty");
  }
  return {
    fixtureId: requireString(raw.fixture_id, "fixture_id"),
    materialTerms,
    expectedMaterialTruth: requireString(
      raw.expected_material_truth,
      "expected_material_truth",
    ),
    boundaryUncertaintyTerms: requireStrings(
      raw.boundary_uncertainty_terms,
      "boundary_uncertainty_terms",
    ),
    boundaryContextTerms: requireStrings(
      raw.boundary_context_terms,
      "boundary_context_terms",
    ),
    actionMaterialTerms: requireStrings(
      raw.action_material_terms,
      "action_material_terms",
    ),
    actionRemediationTerms: requireStrings(
      raw.action_remediation_terms,
      "action_remediation_terms",
    ),
    targetAnchor: requireString(raw.target_anchor, "target_anchor"),
    targetAnchorTerms: requireStrings(raw.target_anchor_terms, "target_anchor_terms"),
  };
}

async function latestEvidenceDir(fixtureId: string): Promise<string> {
  // 세션 id는 YYYYMMDD-<random hex>라 이름 정렬은 동일 날짜 재실행 순서를
  // 보장하지 않는다 — mtime으로 최신 run을 고른다.
  const evidenceRoot = path.join(FIXTURES_ROOT, fixtureId, "evidence");
  let latest: string | null = null;
  let latestMtimeMs = -1;
  for (const session of await fs.readdir(evidenceRoot)) {
    const sessionDir = path.join(evidenceRoot, session);
    const stat = await fs.stat(sessionDir);
    if (!stat.isDirectory()) continue;
    if (stat.mtimeMs > latestMtimeMs) {
      latestMtimeMs = stat.mtimeMs;
      latest = sessionDir;
    }
  }
  if (!latest) throw new Error(`no persisted evidence for fixture: ${fixtureId}`);
  return latest;
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const ids = requested.length > 0 ? requested : FIXTURE_IDS;
  const { evaluateReviewPipelineSemanticQualityGate } = await import(
    path.join(REPO_ROOT, "src/core-runtime/review/semantic-quality-gate.ts")
  );

  const results: Array<Record<string, unknown>> = [];
  for (const token of ids) {
    const [id, pinnedSession] = token.split(":");
    if (!id) throw new Error(`invalid fixture token: ${token}`);
    const expectations = await loadExpectations(id);
    const evidenceDir = pinnedSession
      ? path.join(FIXTURES_ROOT, id, "evidence", pinnedSession)
      : await latestEvidenceDir(id);
    await fs.access(evidenceDir);
    const result = evaluateReviewPipelineSemanticQualityGate({
      expectations,
      reviewRecord: await readYaml(path.join(evidenceDir, "review-record.yaml")),
      finalOutputText: await fs.readFile(
        path.join(evidenceDir, "final-output.md"),
        "utf8",
      ),
      issueArtifacts: {
        findingLedger: await readOptionalYaml(
          path.join(evidenceDir, "finding-ledger.yaml"),
        ),
        relationGraph: await readOptionalYaml(
          path.join(evidenceDir, "finding-relation-graph.yaml"),
        ),
        issueLedger: await readOptionalYaml(
          path.join(evidenceDir, "issue-ledger.yaml"),
        ),
      },
    });
    console.log(`\n=== [${id}] gate=${result.status} (${expectations.fixtureId})`);
    for (const check of result.checks) {
      console.log(`  ${check.status === "passed" ? "PASS" : "FAIL"}  ${check.check_id}`);
      if (check.status === "failed") {
        for (const line of check.evidence) console.log(`        - ${line}`);
      }
    }
    results.push({
      fixture: id,
      evidence_dir: path.relative(REPO_ROOT, evidenceDir),
      gate: result,
    });
  }

  const outPath = path.join(FIXTURES_ROOT, `semantic-gate-results-${Date.now()}.json`);
  await fs.writeFile(outPath, JSON.stringify(results, null, 2));
  console.log(`\n결과 기록: ${outPath}`);
}

await main();
