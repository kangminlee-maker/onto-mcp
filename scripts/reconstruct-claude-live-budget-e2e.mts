/**
 * Live P6 verification for the model-window-aware document projection budget
 * (large-input Stage 1' v5). Sibling of reconstruct-claude-live-document-e2e.mts
 * (which proves the claude_code route for the `document` kind) — this one proves
 * the BUDGET behavior (done-when #6) over the same anthropic+oauth opus seat.
 *
 * It runs reconstruct on a single large text document (> the 200K projection
 * FLOOR, <= the opus projection budget) and asserts:
 *   - the run COMPLETES (no context-window overflow) — the conservative budget is
 *     safe, even for the CJK-dense fixture (C1);
 *   - the model-call telemetry is anthropic/<opus> — the dynamic budget resolved
 *     from a real model window (not mock / FLOOR-via-unknown);
 *   - the captured excerpt is the whole document and exceeds 200K
 *     (excerpt_truncated === false) — capture is not the bottleneck;
 *   - NO seed-stage projection truncation occurred (no source-projection-budget
 *     runtime event, no "Source Projection Truncation" final-output section) —
 *     a document above the 200K FLOOR is projected WHOLE, which only the dynamic
 *     budget (~450K for opus) explains; the static FLOOR alone would have sliced it;
 *   - the document tail (a unique late-section sentinel) is present in the captured
 *     excerpt within the budget — late content reaches the seed-authoring prompt.
 *
 * Two fixtures (run via FIXTURE_KIND): `normal` (mixed KO/EN prose) and `cjk`
 * (Korean-dense, the conservative-budget overflow probe). Fixtures are generated
 * deterministically into an isolated tmp project (not committed). Does not touch
 * the code/document evidence files (the supported-models G7 ref) or ~/.onto.
 *
 * Usage:
 *   FIXTURE_KIND=normal ONTO_LLM_TIMEOUT_MS=600000 \
 *     npx tsx scripts/reconstruct-claude-live-budget-e2e.mts
 *   FIXTURE_KIND=cjk    ONTO_LLM_TIMEOUT_MS=600000 \
 *     npx tsx scripts/reconstruct-claude-live-budget-e2e.mts
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOntoReconstructCoreApi } from "../src/core-api/reconstruct-api.ts";
import { writeProviderSettings } from "../src/core-runtime/onboard/configure-provider.ts";
import { resolveClaudeBin } from "../src/core-runtime/llm/claude-bin.ts";
import { normalizeLlmModelSwitcher } from "../src/core-runtime/llm/model-switcher.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = process.env.E2E_MODEL ?? "claude-opus-4-8";
const EFFORT = process.env.E2E_EFFORT ?? "medium";
const FIXTURE_KIND = (process.env.FIXTURE_KIND ?? "normal") as "normal" | "cjk";
// Just over the 200K projection FLOOR so a whole projection proves the dynamic
// budget (the FLOOR alone would slice it), while keeping the prompt size — and so
// the cost/latency of a real opus run — bounded.
const TARGET_CHARS = Number(process.env.E2E_TARGET_CHARS ?? "210000");
const LATE_SENTINEL = "SENTINEL-LATE-7Q-2027";

function log(msg: string): void {
  process.stdout.write(`[claude-live-budget-e2e:${FIXTURE_KIND}] ${msg}\n`);
}

// Distinct Korean review topics — each a genuinely different business area with
// its own owner, object, target, problem, and decision. Cycled with section-unique
// figures so the CJK-dense fixture reads like a real strategy review (distinct core
// per section), not a repeated block — the latter starved the seed-authoring
// readiness/purpose gates of distinct static_core elements.
const KO_TOPICS: Array<(n: number) => string> = [
  (n) => `교육과정개편팀은 직무 중심 커리큘럼 ${n}개 트랙을 ${n}분기까지 재설계한다. ` +
    `목표는 수료율을 ${60 + (n % 30)}%로 높이는 것이며, 핵심 문제는 콘텐츠 노후화다. ` +
    `본부장은 개편 우선순위를 의결하고 강사 피드백을 반영해 개정안을 확정한다. `,
  (n) => `강사양성본부는 신규 강사 ${20 + n}명을 모집하고 인증 시험 합격 기준을 정한다. ` +
    `대상 객체는 강사 인증 등급 체계이며, 문제는 우수 강사 이탈률 ${10 + (n % 15)}%다. ` +
    `양성팀장은 멘토링 배정을 결정하고 분기 인증 현황을 경영진에 보고한다. `,
  (n) => `마케팅실은 채널 ${n}개의 유입과 전환을 분석해 광고 예산을 재배분한다. ` +
    `핵심 지표는 채널별 전환율과 고객획득비용(CAC)이며, 목표 CAC는 ${30 + n}만원이다. ` +
    `마케팅 리더는 캠페인 중단·확대를 결정하고 주간 성과를 검토한다. `,
  (n) => `재무팀은 ${n}분기 손익계산서와 투자 회수 기간을 산정해 건전성을 점검한다. ` +
    `대상은 사업부별 영업이익률이며, 목표는 ${8 + (n % 12)}% 달성이다. ` +
    `CFO는 비용 절감안과 신규 투자 집행을 승인하고 리스크를 등록부에 기록한다. `,
  (n) => `신규사업개발팀은 인접 시장 ${n}개의 사업 타당성을 평가한다. ` +
    `객체는 신규 사업 정의와 진입 시나리오이며, 문제는 규제 불확실성이다. ` +
    `사업개발 본부장은 진입·보류를 결정하고 파일럿 예산 ${50 + n}백만원을 배정한다. `,
  (n) => `글로벌사업팀은 해외 거점 ${1 + (n % 6)}개의 현지화 전략을 수립한다. ` +
    `목표는 ${n}분기까지 현지 파트너 ${2 + (n % 5)}곳과 제휴 체결이며, 문제는 환율 변동이다. ` +
    `글로벌 총괄은 진출 국가 우선순위를 결정하고 현지 채용 계획을 승인한다. `,
  (n) => `품질관리팀은 강의 만족도(NPS)와 클레임 ${n}건을 분석해 품질 기준을 갱신한다. ` +
    `대상은 품질 평가 루브릭이며, 목표 NPS는 ${50 + (n % 40)}점이다. ` +
    `품질 책임자는 재교육 대상을 결정하고 시정 조치 이행을 추적한다. `,
  (n) => `데이터거버넌스팀은 지표 정의 ${n}개를 표준화하고 대시보드 권한을 정비한다. ` +
    `객체는 핵심 지표 사전(metric dictionary)이며, 문제는 부서별 정의 불일치다. ` +
    `데이터 책임자는 단일 정의를 의결하고 분기 데이터 품질 감사를 지시한다. `,
  (n) => `파트너십팀은 제휴사 ${n}곳과의 수익 배분 구조를 재협상한다. ` +
    `대상은 제휴 계약 조건이며, 목표는 정산 주기를 ${30 - (n % 20)}일로 단축하는 것이다. ` +
    `제휴 담당 임원은 계약 갱신·해지를 결정하고 분쟁 리스크를 점검한다. `,
  (n) => `리스크관리팀은 규제·보안 리스크 ${n}건을 등급화해 대응 계획을 마련한다. ` +
    `객체는 리스크 등록부와 대응 매뉴얼이며, 문제는 개인정보 처리 컴플라이언스다. ` +
    `리스크 책임자는 완화 조치 우선순위를 결정하고 이행 현황을 이사회에 보고한다. `,
  (n) => `조직개발팀은 본부 ${n}개의 R&R과 인력 배치를 재정의한다. ` +
    `대상은 직무 기술서와 평가 체계이며, 목표는 충원율 ${80 + (n % 18)}% 달성이다. ` +
    `인사 책임자는 조직 개편안을 의결하고 핵심 인재 유지 방안을 승인한다. `,
  (n) => `운영지원팀은 주간 운영 지표 ${n}종을 검토하고 의사결정 회의체를 운영한다. ` +
    `객체는 운영 대시보드와 회의 안건이며, 문제는 의사결정 지연이다. ` +
    `운영 총괄은 안건 우선순위를 결정하고 후속 액션의 책임자와 기한을 지정한다. `,
  (n) => `고객성공팀은 수강생 이탈 신호 ${n}개를 모니터링해 리텐션 전략을 실행한다. ` +
    `대상은 고객 여정 지도이며, 목표는 분기 재등록률 ${40 + (n % 35)}% 달성이다. ` +
    `CS 리더는 개입 시점을 결정하고 이탈 사유를 문제 등록부에 기록한다. `,
  (n) => `IT플랫폼팀은 학습 플랫폼 기능 ${n}개의 안정성과 응답속도를 점검한다. ` +
    `객체는 플랫폼 SLA와 장애 대응 절차이며, 목표 가용성은 99.${n % 10}%다. ` +
    `플랫폼 책임자는 배포 일정과 롤백 기준을 결정하고 장애 리스크를 추적한다. `,
];

/** Deterministic large document with heading/section structure and a unique
 * late-section sentinel. `cjk` is Korean-dense (low chars/token — the conservative
 * budget's overflow probe) built from genuinely distinct per-section review topics;
 * `normal` is mixed KO/EN prose. */
function buildFixture(kind: "normal" | "cjk", targetChars: number): string {
  if (kind === "cjk") {
    const parts: string[] = ["# 2027 전사 전략·조직 점검 보고서\n\n"];
    let section = 1;
    while (parts.join("").length < targetChars - 1400) {
      const topic = KO_TOPICS[(section - 1) % KO_TOPICS.length]!;
      parts.push(`## 섹션 ${section}: ${topic(section).slice(0, 14)}점검\n\n`);
      // 3 distinct topics per section (rotating) so each section's core differs.
      for (let i = 0; i < 4; i++) {
        const t = KO_TOPICS[(section + i) % KO_TOPICS.length]!;
        parts.push(`(${section}.${i}) ${t(section * 7 + i + 1)}\n`);
      }
      parts.push("\n");
      section++;
    }
    parts.push(
      `## 섹션 ${section}: 최종 마일스톤 (문서 말미)\n\n` +
        `최종 마일스톤 ${LATE_SENTINEL}: 2027년 4분기까지 글로벌 거점을 12개로 ` +
        "확장하고 누적 매출 8,400억원을 달성하며, 신규 강사 240명을 양성한다. " +
        "이 목표는 문서 말미에만 등장하므로, 앞부분만 투영되면 시드에 유입되지 않는다.\n",
    );
    return parts.join("");
  }

  // normal: mixed KO/EN prose (unchanged — its committed evidence is reproducible).
  const koBlock =
    "본 점검 문서는 조직과 본부, 기획자, 강사, 마케팅 담당이 사업 정의와 목표, " +
    "마일스톤, 문제, 전략을 어떻게 점검하고 결정하며 실행하는지를 기술한다. " +
    "각 섹션은 진술을 뒷받침하는 근거와 책임 주체를 명시하고, 분기별 목표 수치와 " +
    "리스크 대응 방안을 상세히 정리한다. 운영팀은 매주 지표를 검토하고 의사결정을 기록한다. ";
  const enBlock =
    "This section records who reviews, decides, and acts, and which business " +
    "definition, targets, milestones, problems, and strategies the plan states. " +
    "Each claim is backed by an explicit owner and a quarterly metric, with risk " +
    "mitigations tracked weekly by the operations team across every business unit. ";
  const unit = koBlock + enBlock;
  const parts: string[] = ["# 2027 Reset Strategy & Organization Review\n\n"];
  let section = 1;
  while (parts.join("").length < targetChars - 1200) {
    parts.push(`## Section ${section}: Review Area ${section}\n\n`);
    for (let i = 0; i < 6; i++) {
      parts.push(`(${section}.${i}) ${unit}\n`);
    }
    parts.push("\n");
    section++;
  }
  parts.push(
    `## Section ${section}: Final Milestone (document tail)\n\n` +
      `Final milestone ${LATE_SENTINEL}: by Q4 2027 expand to 12 global hubs, ` +
      "reach 840B KRW cumulative revenue, and certify 240 new instructors. " +
      "This target appears only at the document tail, so a lead-only projection " +
      "would never reach seed authoring.\n",
  );
  return parts.join("");
}

interface NdjsonEvent {
  source?: { label?: string };
  stream?: string;
  message?: string;
}

async function readNdjson(filePath: string): Promise<NdjsonEvent[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as NdjsonEvent);
  } catch {
    return [];
  }
}

async function main(): Promise<number> {
  log(`claude binary resolved: ${resolveClaudeBin()}`);
  log(`config: model=${MODEL} effort=${EFFORT} kind=${FIXTURE_KIND} target_chars=${TARGET_CHARS}`);

  // The seat must resolve to the claude_code worker (anthropic OAuth), like the
  // document runner — otherwise this would prove nothing about the live route.
  const resolvedAdapter = normalizeLlmModelSwitcher({
    provider: "anthropic",
    auth: "oauth",
    model: MODEL,
  })?.execution_adapter;
  if (resolvedAdapter !== "claude_code") {
    log(`FAIL: seat anthropic/oauth/${MODEL} resolves to execution_adapter=${resolvedAdapter ?? "(none)"}, not claude_code.`);
    return 1;
  }

  // E2E_DOC_PATH overrides the generated fixture with a real document (must already
  // contain the late sentinel for the late-inflow signal, or that check is skipped).
  // Otherwise a deterministic per-section-distinct fixture is generated.
  const docText = process.env.E2E_DOC_PATH
    ? await fs.readFile(process.env.E2E_DOC_PATH, "utf8")
    : buildFixture(FIXTURE_KIND, TARGET_CHARS);
  if (process.env.E2E_DOC_PATH) log(`fixture from E2E_DOC_PATH=${process.env.E2E_DOC_PATH}`);
  log(`fixture: ${docText.length} chars, ${docText.split("\n").length} lines (> 200K FLOOR)`);
  if (docText.length <= 200_000) {
    log("FAIL: fixture is not above the 200K projection FLOOR; cannot discriminate the dynamic budget.");
    return 1;
  }

  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `onto-claude-live-budget-${FIXTURE_KIND}-`),
  );
  log(`isolated project: ${projectRoot}`);
  const targetRel = `2027-strategy-review-${FIXTURE_KIND}.md`;
  await fs.writeFile(path.join(projectRoot, targetRel), docText, "utf8");

  const settingsPath = path.join(projectRoot, ".onto", "settings.json");
  await writeProviderSettings(
    { provider: "anthropic", model: MODEL, auth: "oauth", effort: EFFORT },
    { target: "project", projectRoot, settingsPath },
  );
  // writeProviderSettings sets reconstruct + review ACTORS to anthropic/<opus>, but
  // ontoHome=REPO_ROOT merges the repo's committed home settings, whose per-unit
  // review overrides pin model=gpt-5.5 with no provider — under the anthropic actor
  // those resolve to the unsupported pair anthropic/gpt-5.5 and the supported-model
  // gate (which validates EVERY seat in the merged settings, even for a reconstruct
  // run) rejects the run. Override every review/reconstruct UNIT to the same
  // anthropic/<opus> seat so the merged settings are uniformly benchmark-verified.
  const projectSettings = JSON.parse(await fs.readFile(settingsPath, "utf8")) as any;
  const repoSettings = JSON.parse(
    await fs.readFile(path.join(REPO_ROOT, ".onto", "settings.json"), "utf8"),
  ) as any;
  const seat = { provider: "anthropic", model: MODEL, auth: "oauth", effort: EFFORT };
  for (const pipeline of ["review", "reconstruct"] as const) {
    const repoUnits = repoSettings?.[pipeline]?.execution?.units ?? {};
    const unitKeys = Object.keys(repoUnits);
    if (unitKeys.length === 0) continue;
    projectSettings[pipeline] ??= {};
    projectSettings[pipeline].execution ??= {};
    projectSettings[pipeline].execution.units ??= {};
    for (const unitKey of unitKeys) {
      projectSettings[pipeline].execution.units[unitKey] = { llm: { ...seat } };
    }
  }
  await fs.writeFile(settingsPath, `${JSON.stringify(projectSettings, null, 2)}\n`, "utf8");
  log(`seat: anthropic/oauth/${MODEL}/effort=${EFFORT} (actors + review/reconstruct units)`);

  const sessionRootRel = `.onto/reconstruct/claude-live-budget-${FIXTURE_KIND}`;
  if (process.env.DRY_RUN === "1") {
    log(`DRY_RUN: fixture+seat prepared, skipping the live reconstruct call. project=${projectRoot}`);
    return 0;
  }
  // ontoHome must be a real onto install (package.json + .onto/roles + .onto/authority),
  // so it is the repo. The project settings above override every merged seat to
  // anthropic/<opus> so the repo's home settings never contribute an unsupported seat.
  const api = createOntoReconstructCoreApi({ ontoHome: REPO_ROOT });
  const intent =
    "이 전략·조직 점검 문서에서 경계 있는 운영 시드를 reconstruct한다: 주체가 무엇을 " +
    "점검·결정·실행하며 어떤 정의·목표·마일스톤·문제·전략이 정의되는가. 특히 문서 말미의 " +
    "최종 마일스톤까지 포함하라. Reconstruct a bounded operational seed; include the " +
    "final milestone stated at the document tail.";

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let result: Awaited<ReturnType<typeof api.runReconstruct>>;
  try {
    result = await api.runReconstruct({
      projectRoot,
      targetRefs: [targetRel],
      sessionRoot: sessionRootRel,
      intent,
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
    });
  } catch (error) {
    const durationS = (Date.now() - t0) / 1000;
    log(`FAILED after ${durationS.toFixed(1)}s: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const durationS = (Date.now() - t0) / 1000;

  const record = result.reconstructRecord as Record<string, unknown>;
  const status = String(record?.record_stage ?? "(unknown)");
  const materialKind = String(record?.target_material_kind ?? "(unknown)");
  const manifest = result.reconstructRunManifest as { steps?: Array<Record<string, any>> } | null;
  const modelCallSteps = (manifest?.steps ?? [])
    .filter((s) => s.execution_telemetry?.model_id != null)
    .map((s) => ({
      provider_route: s.execution_telemetry?.provider_route ?? null,
      model_id: s.execution_telemetry?.model_id ?? null,
    }));
  const usedOpus =
    modelCallSteps.length > 0 &&
    modelCallSteps.every((t) => t.provider_route === "anthropic" && String(t.model_id) === MODEL);

  // Capture signal: the whole document captured, above the FLOOR.
  const sessionRootAbs = path.join(projectRoot, sessionRootRel);
  const { parse: parseYaml } = await import("yaml");
  const sourceObservations = parseYaml(
    await fs.readFile(path.join(sessionRootAbs, "source-observations.yaml"), "utf8"),
  ) as { observations?: Array<{ structural_data?: Record<string, any> }> };
  const docObs = (sourceObservations.observations ?? []).find(
    (o) => o.structural_data?.extension === ".md",
  );
  const sd = docObs?.structural_data ?? {};
  const capturedChars: number = typeof sd.content_excerpt === "string" ? sd.content_excerpt.length : 0;
  const charCount: number = typeof sd.char_count === "number" ? sd.char_count : 0;
  const excerptTruncated: boolean = sd.excerpt_truncated === true;
  const capturedWhole = capturedChars === charCount && charCount > 200_000 && !excerptTruncated;
  // External documents (E2E_DOC_PATH) are not required to carry the synthetic late
  // sentinel, so the late-inflow signal is asserted only for the generated fixtures (per
  // the E2E_DOC_PATH note above); for an external doc that check is skipped.
  const usesExternalDoc = Boolean(process.env.E2E_DOC_PATH);
  const sentinelCaptured =
    typeof sd.content_excerpt === "string" && sd.content_excerpt.includes(LATE_SENTINEL);
  const lateSentinelSignalOk = usesExternalDoc || sentinelCaptured;

  // Projection signal: a doc above the FLOOR but within the budget must NOT be
  // projection-truncated — that whole projection only the dynamic budget explains.
  const events = await readNdjson(path.join(sessionRootAbs, "runtime-events.ndjson"));
  const projectionTruncationEvents = events.filter(
    (e) => e.source?.label === "source-projection-budget",
  );
  const finalOutputText = result.finalOutputPath
    ? await fs.readFile(result.finalOutputPath, "utf8").catch(() => "")
    : "";
  const finalOutputHasTruncationSection = finalOutputText.includes(
    "## Source Projection Truncation",
  );
  const projectedWhole =
    projectionTruncationEvents.length === 0 && !finalOutputHasTruncationSection;

  const completed = status === "completed";
  const pass =
    completed &&
    materialKind === "document" &&
    usedOpus &&
    capturedWhole &&
    lateSentinelSignalOk &&
    projectedWhole;

  log(`status=${status} material_kind=${materialKind} duration_s=${durationS.toFixed(1)}`);
  log(`used_opus_route=${usedOpus} model_call_steps=${modelCallSteps.length}`);
  log(`captured_chars=${capturedChars} char_count=${charCount} excerpt_truncated=${excerptTruncated} captured_whole=${capturedWhole}`);
  log(`late_sentinel_captured=${sentinelCaptured} (required=${!usesExternalDoc}) projected_whole=${projectedWhole} (truncation_events=${projectionTruncationEvents.length}, final_output_section=${finalOutputHasTruncationSection})`);
  log(`final output: ${result.finalOutputPath ?? "(none)"}`);

  const evidenceRel = `development-records/benchmark/reconstruct-pipeline-live-claude-budget-${FIXTURE_KIND}-20260617.json`;
  const evidence = {
    schema_version: "1",
    benchmark_kind: "reconstruct-pipeline-live-document-projection-budget",
    fixture_kind: FIXTURE_KIND,
    target_material_kind: materialKind,
    provider: "anthropic",
    model: MODEL,
    execution_adapter: resolvedAdapter,
    auth: "oauth",
    effort: EFFORT,
    fixture_chars: docText.length,
    started_at: startedAt,
    duration_s: Number(durationS.toFixed(1)),
    record_status: status,
    completed,
    used_opus_route: usedOpus,
    captured_chars: capturedChars,
    captured_whole_above_floor: capturedWhole,
    late_sentinel_captured: sentinelCaptured,
    projected_whole_under_budget: projectedWhole,
    projection_truncation_events: projectionTruncationEvents.length,
    pass,
    runner: "scripts/reconstruct-claude-live-budget-e2e.mts",
    note:
      "Live done-when #6 evidence for the model-window-aware document projection " +
      "budget: a document above the 200K FLOOR is captured and projected WHOLE " +
      "under the dynamic opus budget, late tail reaches the prompt, no overflow. " +
      "PRELIMINARY for any performance/quality claim.",
  };
  if (pass) {
    await fs.mkdir(path.join(REPO_ROOT, path.dirname(evidenceRel)), { recursive: true });
    await fs.writeFile(
      path.join(REPO_ROOT, evidenceRel),
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
    log(`evidence record written: ${evidenceRel}`);
    log("PASS: done-when #6 satisfied for this fixture.");
    return 0;
  }
  log(`FAIL: done-when #6 not satisfied (see signals above). evidence (not written): ${JSON.stringify(evidence)}`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `[claude-live-budget-e2e] error: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exit(1);
  },
);
