/**
 * 온톨로지 문제 fixture에 대한 live 리뷰 러너 (탐색용, PRELIMINARY).
 *
 * 각 fixture의 target/ 문서를 tmp 프로젝트로 복사하고, repo의 현재
 * settings(mixed effort 프로파일, oauth live)를 그대로 적용해 core-axis
 * 리뷰를 순차 실행한다. 세션 경로를 결과 JSON에 남겨 ground-truth 채점에
 * 사용한다. 사용:
 *   npx tsx development-records/benchmark/fixtures/ontology/run-ontology-review.mts [fixtureId ...]
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const FIXTURES_ROOT = path.join(
  REPO_ROOT,
  "development-records/benchmark/fixtures/ontology",
);

const FIXTURES: Record<string, { targetFile: string; intent: string }> = {
  "clinical-lab-workflow": {
    targetFile: "clinical-lab-ontology.yaml",
    intent:
      "이 임상검사 워크플로 온톨로지가 EMR/LIS 통합의 개념 권위 문서로 쓰기에 적절한지 검토해 달라. 엔티티·관계·상태 모델의 개념적 타당성과 운영 시 생길 위험을 중심으로.",
  },
  "credit-risk-taxonomy": {
    targetFile: "credit-risk-ontology.yaml",
    intent:
      "이 여신 리스크 분류 온톨로지가 리스크 엔진과 보고 시스템이 공유할 개념 기준으로 적절한지 검토해 달라. 분류체계·권위·시간성 관점의 개념 결함과 운영 위험을 중심으로.",
  },
  "manufacturing-bom": {
    targetFile: "manufacturing-bom-ontology.yaml",
    intent:
      "이 BOM/공정 온톨로지가 PLM/MES 통합의 개념 기준 문서로 적절한지 검토해 달라. 품목·BOM·라우팅·변경관리 개념의 정합성과 제조 운영 위험을 중심으로.",
  },
};

/** 감사 가능성: 채점 근거가 되는 세션 아티팩트를 repo 증거 디렉토리로 영속화. */
const EVIDENCE_ARTIFACTS = [
  "session-metadata.yaml",
  "finding-ledger.yaml",
  "finding-relation-graph.yaml",
  "issue-ledger.yaml",
  "problem-framing.yaml",
  "review-record.yaml",
  "final-output.md",
  "execution-result.yaml",
  "synthesis.md",
  "deliberation-plan.yaml",
];

async function persistEvidence(fixtureId: string, sessionRoot: string): Promise<string> {
  const dst = path.join(FIXTURES_ROOT, fixtureId, "evidence", path.basename(sessionRoot));
  await fs.mkdir(dst, { recursive: true });
  for (const file of EVIDENCE_ARTIFACTS) {
    try {
      await fs.copyFile(path.join(sessionRoot, file), path.join(dst, file));
    } catch {
      // 해당 run에 없는 아티팩트는 건너뜀
    }
  }
  // ledger의 source_ref/evidence_refs가 round1 lens 산출물을 가리키므로
  // round1을 함께 영속화해야 evidence 번들이 자급자족한다.
  try {
    const round1Src = path.join(sessionRoot, "round1");
    const round1Dst = path.join(dst, "round1");
    await fs.mkdir(round1Dst, { recursive: true });
    for (const file of await fs.readdir(round1Src)) {
      await fs.copyFile(path.join(round1Src, file), path.join(round1Dst, file));
    }
  } catch {
    // round1 부재 run은 건너뜀
  }
  // review-record가 참조하는 준비 입력(target_snapshot_ref/materialized_input_ref)도
  // 상대 구조를 유지해 영속화 — finding의 materialized-input.md:NN 인용을 repo만으로 추적.
  for (const prep of ["target-snapshot.md", "materialized-input.md"]) {
    try {
      const prepDst = path.join(dst, "execution-preparation");
      await fs.mkdir(prepDst, { recursive: true });
      await fs.copyFile(
        path.join(sessionRoot, "execution-preparation", prep),
        path.join(prepDst, prep),
      );
    } catch {
      // 해당 run에 없는 준비 아티팩트는 건너뜀
    }
  }
  return dst;
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const ids = requested.length > 0 ? requested : Object.keys(FIXTURES);
  // settings chain 격리: 사용자 ~/.onto 설정이 결과에 섞이지 않도록 HOME을
  // 비운 tmp로 고정 — 커밋된 repo settings만이 실행 프로파일을 결정한다.
  const realHome = process.env.HOME ?? os.homedir();
  const isolatedHome = await fs.mkdtemp(path.join(os.tmpdir(), "onto-ontology-eval-home-"));
  // 격리 대상은 settings(~/.onto)뿐이다 — codex OAuth 자격증명($HOME/.codex)은
  // worker 경로 탐지에 필요하므로 실제 홈으로 연결한다. 없으면 런타임이
  // 자체적으로 경로 해소 실패를 보고한다.
  try {
    await fs.symlink(path.join(realHome, ".codex"), path.join(isolatedHome, ".codex"));
  } catch {
    // 실제 홈에 ~/.codex가 없는 환경: 연결 생략
  }
  process.env.HOME = isolatedHome;
  const { createOntoReviewCoreApi } = await import(
    path.join(REPO_ROOT, "src/core-api/review-api.ts")
  );
  const repoSettings = await fs.readFile(
    path.join(REPO_ROOT, ".onto/settings.json"),
    "utf8",
  );

  const results: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    const fixture = FIXTURES[id];
    if (!fixture) throw new Error(`unknown fixture: ${id}`);
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), `onto-ontology-eval-${id}-`),
    );
    const targetDir = path.join(FIXTURES_ROOT, id, "target");
    for (const file of await fs.readdir(targetDir)) {
      await fs.copyFile(path.join(targetDir, file), path.join(projectRoot, file));
    }
    await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, ".onto/settings.json"), repoSettings);

    console.log(`\n=== [${id}] review 시작 (${new Date().toISOString()}) ===`);
    const api = createOntoReviewCoreApi({ ontoHome: REPO_ROOT });
    const startedAt = Date.now();
    try {
      const run = await api.runReview({
        projectRoot,
        target: fixture.targetFile,
        intent: fixture.intent,
        noDomain: true,
        reviewMode: "core-axis",
      });
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      const evidenceDir = await persistEvidence(id, run.sessionRoot);
      console.log(
        `[${id}] status=${run.status} session=${run.sessionRoot} evidence=${evidenceDir} (${elapsedSec}s)`,
      );
      results.push({
        fixture: id,
        status: run.status,
        session_root: run.sessionRoot,
        evidence_dir: path.relative(REPO_ROOT, evidenceDir),
        project_root: projectRoot,
        elapsed_sec: elapsedSec,
      });
    } catch (error) {
      console.error(`[${id}] FAILED:`, (error as Error).message.slice(0, 400));
      results.push({
        fixture: id,
        status: "error",
        error: (error as Error).message.slice(0, 400),
        project_root: projectRoot,
      });
    }
  }

  const outPath = path.join(FIXTURES_ROOT, `run-results-${Date.now()}.json`);
  await fs.writeFile(outPath, JSON.stringify(results, null, 2));
  console.log(`\n결과 기록: ${outPath}`);
}

await main();
