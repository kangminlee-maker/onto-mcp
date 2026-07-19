/**
 * 무-spend ablation 렌더 재구성 (§10 v2.1 재평정 게이트 3항 · 핸드오프 §1-5).
 *
 * v1 live run(20260719-semantic-map-gsem-n1)의 runtime-events에서 synthesize 109 응답을
 * 복원하고, 결정론 파이프라인(관찰→fold→accumulate)을 현재 코드로 재주행하되 LLM 출력은
 * v1 응답을 그대로 replay — synthesize 비용 0. 그 위에 DD10만 적용된 projection/렌더
 * (admission comparator·max_nodes 512·budget 12,000·상대경로 라벨)를 생성한다.
 *
 * 인과 분리: LLM 출력(요약·경계)은 v1과 동일하므로, 이 렌더와 v1 렌더의 차이는 오직
 * projection/렌더 계층(DD10)이다. DD10-only PASS면 렌더 계층이 7b FAIL의 지배 원인.
 * (주의: 현재 모듈은 DD6′ 봉투를 구성하지만 replay는 응답만 소비하므로 봉투 내용은
 * 이 산출물에 영향 없음 — 입력 drift 검사는 의도적으로 하지 않는다: v1 봉투에는
 * source_lines가 없다.)
 *
 * sidecar는 60/109 lex-컷 사본이라 소스로 쓰지 않는다 (리뷰 gh m-1).
 *
 *   npx tsx development-records/benchmark/20260719-semantic-map-v2-ablation/render-ablation.mts
 *
 * stdout에는 유효성 지표만 출력한다 (admit 수·라인 커버리지 — §10 유효성 전제:
 * admit ≥30 AND 커버리지 ≥80%, 미달 = 시험 무효). 렌더 본문은 파일로만 쓴다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { observeCodeStructure } from "../../../src/core-runtime/code-structure-observer.js";
import {
  codeReduceNodeKey,
  foldCodeStructureInventory,
} from "../../../src/core-runtime/reconstruct/comprehension-reduce-code.js";
import {
  accumulateCodeSemanticMap,
  buildCodeSynthesisMeta,
  projectCodeSemanticMapToSeed,
  type CodeSemanticSynthesisOutput,
} from "../../../src/core-runtime/reconstruct/comprehension-semantic-map-code.js";
import {
  renderSemanticMapProjection,
  CODE_SEMANTIC_MAP_MAX_NODES,
  CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
} from "../../../src/core-runtime/reconstruct/run.js";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const TARGET_FILE = path.join(REPO_ROOT, "src/core-runtime/code-structure-observer.ts");
const EVENTS = path.join(
  REPO_ROOT,
  "development-records/benchmark/20260719-semantic-map-gsem-n1/runtime-events.ndjson",
);
const OUT_DIR = path.dirname(new URL(import.meta.url).pathname);
/** 재평정 게이트 1항 (리뷰 gh m-3): G-SEM 대상 파일 content sha 선두 재핀 — run 시 단언. */
const TARGET_SHA_PREFIX = "8f055465204ffb4e";
/** v1 실측: synthesize 정확히 109 (결정론 프로브 일치) — 복원이 이보다 적으면 fail-loud. */
const EXPECTED_SYNTHESIZE = 109;

const SYNTH_ANCHOR = "You are reading ONE code file region";
const VERIFY_ANCHOR = "re-checker for ONE proposed semantic boundary in a code file region";

interface StreamEvent {
  stream: string;
  message: string;
}

function braceDelta(line: string): number {
  // 페이로드는 pretty-print JSON — 문자열 내부 중괄호가 라인 단위 집계를 흔들 수 있으므로
  // 문자열 리터럴 내 문자는 제외하고 센다.
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (const ch of line) {
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  }
  return depth;
}

/** anchor 이벤트 뒤의 "---" 이후 pretty-JSON 페이로드와, 그 뒤 첫 stdout JSON 응답을 짝짓는다. */
function extractDispatches(
  events: StreamEvent[],
  anchor: string,
  responseHead: string,
): { payload: Record<string, unknown>; response: Record<string, unknown> }[] {
  const out: { payload: Record<string, unknown>; response: Record<string, unknown> }[] = [];
  for (let i = 0; i < events.length; i += 1) {
    if (!events[i]!.message.startsWith(anchor)) continue;
    let j = i + 1;
    while (j < events.length && events[j]!.message.trim() !== "---") j += 1;
    j += 1;
    const lines: string[] = [];
    let depth = 0;
    let started = false;
    for (; j < events.length; j += 1) {
      const m = events[j]!.message;
      if (!started && m.trim() !== "{") continue;
      started = true;
      lines.push(m);
      depth += braceDelta(m);
      if (depth === 0) break;
    }
    const payload = JSON.parse(lines.join("\n")) as Record<string, unknown>;
    let response: Record<string, unknown> | null = null;
    for (let k = j + 1; k < events.length; k += 1) {
      const e = events[k]!;
      if (e.stream === "stdout" && e.message.startsWith(responseHead)) {
        response = JSON.parse(e.message) as Record<string, unknown>;
        break;
      }
      if (e.message.startsWith(anchor)) break; // 다음 dispatch 시작 — 응답 미발견은 fail-loud로
    }
    if (!response) throw new Error(`ablation: no response found for dispatch at event ${i}`);
    out.push({ payload, response });
  }
  return out;
}

async function main(): Promise<void> {
  const text = await fs.readFile(TARGET_FILE, "utf8");
  const observed = await observeCodeStructure({ ref: TARGET_FILE, text });
  if (observed.status !== "ok") throw new Error(`target must observe ok, got ${observed.status}`);
  const inventory = observed.inventory;
  if (!inventory.content_sha256.startsWith(TARGET_SHA_PREFIX)) {
    throw new Error(
      `G-SEM target sha drift: ${inventory.content_sha256.slice(0, 16)} !== ${TARGET_SHA_PREFIX} — 대상 오염, ablation 무효 (재평정 게이트 1항).`,
    );
  }

  const events: StreamEvent[] = (await fs.readFile(EVENTS, "utf8"))
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const e = JSON.parse(l) as { stream?: string; message?: string };
      return { stream: e.stream ?? "", message: e.message ?? "" };
    });

  const synth = extractDispatches(events, SYNTH_ANCHOR, '{"semantic_summary"');
  if (synth.length !== EXPECTED_SYNTHESIZE) {
    throw new Error(`ablation: restored ${synth.length} synthesize dispatches, expected ${EXPECTED_SYNTHESIZE}.`);
  }
  const outputByKey = new Map<string, CodeSemanticSynthesisOutput>();
  for (const { payload, response } of synth) {
    const ref = payload.node_ref as { file: string; line_start: number; line_end: number };
    const key = codeReduceNodeKey(ref);
    if (outputByKey.has(key)) throw new Error(`ablation: duplicate synthesize key ${key}`);
    outputByKey.set(key, response as unknown as CodeSemanticSynthesisOutput);
  }

  const verifies = extractDispatches(events, VERIFY_ANCHOR, '{"verdict"').map(({ payload, response }) => {
    const ref = payload.node_ref as { file: string; line_start: number; line_end: number };
    const boundary = payload.boundary as { line: number; character_before: string; character_after: string };
    return {
      key: codeReduceNodeKey(ref),
      line: boundary.line,
      before: boundary.character_before,
      after: boundary.character_after,
      verdict: (response as { verdict: string }).verdict as "adversarial_confirmed" | "adversarial_refuted",
      consumed: false,
    };
  });

  const { trace, nodesByKey } = foldCodeStructureInventory(TARGET_FILE, inventory, 2);
  const meta = buildCodeSynthesisMeta(TARGET_FILE, inventory, text);
  const map = accumulateCodeSemanticMap(meta, trace, nodesByKey, {
    synthesize: (input) => {
      const key = codeReduceNodeKey(input.node_ref);
      const recorded = outputByKey.get(key);
      if (!recorded) throw new Error(`ablation: no recorded v1 output for ${key} — 결정론 재주행이 v1과 어긋남 (fail-loud).`);
      return structuredClone(recorded);
    },
    verifyUnanchored: (input) => {
      const key = codeReduceNodeKey(input.node_ref);
      const match = verifies.find(
        (v) =>
          !v.consumed &&
          v.key === key &&
          v.line === input.boundary.line &&
          v.before === input.boundary.character_before &&
          v.after === input.boundary.character_after,
      );
      if (!match) throw new Error(`ablation: no recorded v1 verify verdict for ${key}@line${input.boundary.line} (fail-loud).`);
      match.consumed = true;
      return match.verdict;
    },
    preImageBase: {
      reduce_reader_model_identity: "ablation-replay",
      reduce_prompt_sha256: "ablation-replay",
      reduce_schema_tool_version: "ablation-replay",
      comprehension_version: "ablation-replay",
      over_context_gate_config_sha256: "ablation-replay",
      over_context_gate_logic_sha256: "ablation-replay",
    },
    overContextBudget: 2,
    seedBound: false,
  });
  const unconsumed = verifies.filter((v) => !v.consumed);
  if (unconsumed.length > 0) {
    throw new Error(`ablation: ${unconsumed.length} recorded verify verdicts unconsumed — 재주행 분류가 v1과 어긋남.`);
  }

  // DD10 projection + 렌더 (선핀 값: max_nodes 512 · budget 12,000 · 상대경로 라벨 · disclosure 30).
  const projection = projectCodeSemanticMapToSeed(map, {
    maxNodes: CODE_SEMANTIC_MAP_MAX_NODES,
    maxDisclosure: 30,
  });
  const render = renderSemanticMapProjection(
    projection,
    CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
    false,
    "code",
    REPO_ROOT,
  ) as { nodes: { region: string }[]; nodes_total: number; render_truncated: boolean };

  // 유효성 지표 (§10 재평정 2항): admit ≥30 AND admit 영역 라인 커버리지 ≥80%.
  const covered = new Set<number>();
  for (const node of render.nodes) {
    const m = /:(\d+)-(\d+)$/.exec(node.region);
    if (!m) throw new Error(`ablation: unparsable region label ${node.region}`);
    for (let ln = Number(m[1]); ln <= Number(m[2]); ln += 1) covered.add(ln);
  }
  const coverage = covered.size / inventory.line_count;

  await fs.writeFile(path.join(OUT_DIR, "treatment-render-v2.json"), `${JSON.stringify(render, null, 2)}\n`, "utf8");
  const metrics = {
    restored_synthesize: synth.length,
    restored_verify: verifies.length,
    map_nodes: map.size,
    projection_nodes_total: projection.nodes_total,
    admitted_nodes: render.nodes.length,
    render_truncated: render.render_truncated,
    file_lines: inventory.line_count,
    covered_lines: covered.size,
    coverage: Number(coverage.toFixed(4)),
    validity_admit_ge_30: render.nodes.length >= 30,
    validity_coverage_ge_080: coverage >= 0.8,
  };
  await fs.writeFile(path.join(OUT_DIR, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(metrics, null, 2));
}

await main();
