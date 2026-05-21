/**
 * TeamCreate Lens Deliberation Executor.
 *
 * # What this module is
 *
 * Realizes the protocol side of topology `cc-teams-lens-agent-deliberation`
 * (sketch v3 §3.1 option 1-0). After each of the N lens agents — spawned
 * as persistent `TeamCreate` members — completes its primary lens
 * reasoning, the teamlead dispatches 1-2 rounds of `SendMessage` controlled-deliberation transport
 * deliberation: every lens agent sees the others' outputs and replies
 * with a re-evaluation. Deliberation outputs are written to
 * `<deliberation_dir>/roundN/<lens_id>-deliberation.md` and fed into
 * the final synthesize step.
 *
 * # Why it exists
 *
 * 1-0 is the only topology in which lens agents can directly cross-talk
 * without ending their sessions — every other topology terminates lens
 * agents after output so only the synthesize step integrates findings.
 * Deliberation therefore requires a persistent `TeamCreate` lifecycle
 * (Claude Code experimental feature; pre-verified by the principal
 * 2026-04-18, handoff §6.7).
 *
 * # How it relates
 *
 * - `resolveExecutionTopology()` selects `cc-teams-lens-agent-deliberation`
 *   only when TRIPLE opt-in is satisfied (CLAUDECODE + experimental flag
 *   + `config.lens_agent_teams_mode`). This module re-checks the same
 *   three flags via `requireDeliberationOptIn()` as a defence-in-depth
 *   guard for direct callers.
 * - `TeamCreate` / `SendMessage` themselves are Claude Code tools invoked
 *   by the Claude coordinator agent (not by the TS subprocess). This
 *   module produces PROTOCOL ARTIFACTS — prompts the agent sends,
 *   markdown files it writes, schema the synthesize step consumes —
 *   so the Claude agent has a deterministic script to follow. The
 *   actual controlled-deliberation transport message dispatch stays at the Claude tool layer.
 *
 * # Scope
 *
 * - Triple opt-in guard (`requireDeliberationOptIn`)
 * - Per-round prompt templates (`buildDeliberationRound1Prompt` /
 *   `buildDeliberationRound2Prompt`)
 * - Artifact read/write helpers (`writeDeliberationArtifact` /
 *   `readDeliberationArtifact`)
 * - Disagreement extraction (`extractDisagreements`) for round 2
 * - Orchestration entrypoint (`runLensAgentDeliberation`) — produces
 *   the deliberation plan structure the coordinator follows
 *
 * Integration into `executeReviewPromptExecution` (routing 1-0 resolutions
 * through this module) is reserved for PR-E.
 *
 * # Design reference
 *
 * - Sketch v3 §3.1 option 1-0, §6.4 (double opt-in becomes triple here)
 * - Handoff §6: development-records/plan/20260418-sketch-v3-implementation-handoff.md
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { OntoConfig } from "../discovery/config-chain.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LensPrimaryOutput {
  lens_id: string;
  /** Absolute path to the lens's round-0 (primary) output markdown. */
  output_path: string;
}

export type DeliberationRoundNumber = 1 | 2;

export interface LensDeliberationInput {
  /**
   * Lens agents whose outputs are already on disk. Order matters only for
   * trace/artifact numbering — the deliberation itself is symmetric.
   */
  lenses: LensPrimaryOutput[];
  /**
   * Directory where deliberation artifacts are written:
   *   <deliberation_dir>/round1/<lens_id>-deliberation.md
   *   <deliberation_dir>/round2/<lens_id>-deliberation.md (if rounds >= 2)
   */
  deliberation_dir: string;
  /** Number of rounds to run. 1 is typical; 2 surfaces disagreements explicitly. */
  rounds: DeliberationRoundNumber;
}

export interface DeliberationRoundPlanStep {
  round: DeliberationRoundNumber;
  lens_id: string;
  /** Prompt text the coordinator sends to this lens agent via SendMessage. */
  prompt: string;
  /** Absolute path where the lens agent's deliberation reply must be written. */
  artifact_path: string;
}

export interface DeliberationPlan {
  /** Ordered steps the coordinator walks through. */
  steps: DeliberationRoundPlanStep[];
  /** Paths the synthesize step reads (all rounds, all lenses). */
  all_artifact_paths: string[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DeliberationOptInError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      [
        "cc-teams-lens-agent-deliberation topology 는 3 중 opt-in 이 모두 필요합니다.",
        "누락된 조건:",
        ...missing.map((m) => `  - ${m}`),
        "",
        "해결:",
        "  1. Claude Code 세션에서 실행 (CLAUDECODE=1 자동)",
        "  2. ~/.claude*/settings.json 에 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 설정",
        "  3. .onto/config.yml 에 lens_agent_teams_mode: true 명시",
      ].join("\n"),
    );
    this.name = "DeliberationOptInError";
  }
}

// ---------------------------------------------------------------------------
// Triple opt-in guard
// ---------------------------------------------------------------------------

/**
 * Defence-in-depth check. `resolveExecutionTopology` already enforces the
 * same three flags at resolver time, but direct callers of this module
 * (tests, bespoke scripts) also bear the invariant. Called at the top of
 * `runLensAgentDeliberation`.
 */
export function requireDeliberationOptIn(
  ontoConfig: OntoConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing: string[] = [];
  if (env.CLAUDECODE !== "1") missing.push("CLAUDECODE=1 (Claude Code 세션 아님)");
  if (env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS !== "1") {
    missing.push("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 (experimental agent teams 미활성)");
  }
  if (ontoConfig.lens_agent_teams_mode !== true) {
    missing.push("config.lens_agent_teams_mode=true (프로젝트 opt-in 미설정)");
  }
  if (missing.length > 0) {
    throw new DeliberationOptInError(missing);
  }
}

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

/**
 * Round 1: give each lens agent the primary outputs of EVERY OTHER lens
 * and ask for a re-evaluation. The lens is free to stand firm, concede,
 * or refine — the prompt does not prescribe an outcome, only the shape
 * of the reply.
 *
 * Design choice: the lens reads its OWN prior output implicitly (it's
 * in its own session memory). We pass only the `own_output_summary`
 * as a name anchor; the full payload that differs is "other lens
 * outputs". This keeps round 1 prompts bounded when N is large.
 */
export function buildDeliberationRound1Prompt(args: {
  own_lens_id: string;
  own_output_summary: string;
  other_lens_outputs: Array<{ lens_id: string; content: string }>;
}): string {
  const otherBlocks = args.other_lens_outputs
    .map((other) => {
      return [
        `## Lens: ${other.lens_id}`,
        "",
        other.content.trim(),
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return [
    `# Deliberation Round 1 — lens "${args.own_lens_id}"`,
    "",
    "당신은 기존에 작성한 검토 결과를 이미 본인 세션에 보유하고 있습니다.",
    `Own output 요약: ${args.own_output_summary}`,
    "",
    "아래는 **다른 lens agent 들의 출력** 입니다. 각 lens 는 독립적으로",
    "관점을 수행했으며, 일부는 당신과 상충하거나 보완할 수 있습니다.",
    "",
    "# 다른 lens 들의 출력",
    "",
    otherBlocks,
    "",
    "# 당신의 작업",
    "",
    "위 내용을 읽고 당신의 기존 결론을 **재평가** 하세요:",
    "",
    "1. **동의 또는 강화**: 다른 lens 의 발견이 당신의 판단을 뒷받침하는가?",
    "   근거를 명시하세요.",
    "2. **반박 또는 수정**: 다른 lens 와 충돌하는 지점이 있는가? 당신의",
    "   기존 결론을 유지할지 수정할지 명시하세요.",
    "3. **새로운 발견**: 다른 lens 출력에서 촉발된 추가 관찰이 있는가?",
    "",
    "응답 형식 (markdown, 600 단어 이내):",
    "",
    "```",
    "## 재평가 요약",
    "<2-3 문장으로 당신의 round 1 이후 입장 요약>",
    "",
    "## 동의/강화 지점",
    "<다른 lens 의 발견 중 당신의 판단을 강화한 것; bullet 또는 문단>",
    "",
    "## 충돌/수정 지점",
    "<다른 lens 와 충돌하는 지점, 당신의 응답 + 기존 결론 유지/수정 여부>",
    "",
    "## 추가 발견",
    "<촉발된 새 관찰; 없으면 '없음' 명시>",
    "```",
    "",
    "이 응답을 당신이 담당한 deliberation artifact 파일에 기록하세요.",
  ].join("\n");
}

/**
 * Round 2: consolidation + disagreement surfacing. Each lens agent sees
 * ALL round-1 responses (including its own) and is asked to either
 * converge or explicitly mark points of persistent disagreement so the
 * synthesizer can represent them faithfully rather than hide them.
 */
export function buildDeliberationRound2Prompt(args: {
  own_lens_id: string;
  round1_responses: Array<{ lens_id: string; content: string }>;
}): string {
  const blocks = args.round1_responses
    .map((r) => `## Round 1 response — lens: ${r.lens_id}\n\n${r.content.trim()}`)
    .join("\n\n---\n\n");

  return [
    `# Deliberation Round 2 — lens "${args.own_lens_id}"`,
    "",
    "Round 1 에서 모든 lens 가 재평가를 마쳤습니다. 아래는 round 1 응답",
    "전체입니다 (당신의 응답 포함). 이제 round 2 에서 다음을 수행하세요:",
    "",
    "1. **수렴 가능 지점**: 여러 lens 가 round 1 에서 일치한 판단을 식별.",
    "2. **지속적 이견**: round 1 이후에도 해소되지 않는 충돌을 식별.",
    "   이견은 숨기지 말고 명시하세요 — synthesizer 는 이견을 있는 그대로",
    "   표상하는 것이 소거하는 것보다 낫습니다.",
    "3. **최종 입장**: 당신의 lens 관점 최종 입장 (round 1 → 2 변화 유무 포함).",
    "",
    "# Round 1 응답 전체",
    "",
    blocks,
    "",
    "# 응답 형식 (markdown, 500 단어 이내)",
    "",
    "```",
    "## 수렴 요약",
    "<모든 lens 가 동의한 판단; bullet>",
    "",
    "## 지속적 이견",
    "<다음 포맷으로 각 이견 항목>",
    "- **이견 항목**: <짧은 제목>",
    "  - 당신의 입장: <...>",
    "  - 반대 입장 (lens X): <...>",
    "  - 해소 경로 (있다면): <...>",
    "",
    "## 최종 입장",
    "<당신의 lens 관점에서 round 1 → 2 를 거친 최종 결론>",
    "```",
    "",
    "이 응답을 당신의 round 2 deliberation artifact 파일에 기록하세요.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Artifact read/write
// ---------------------------------------------------------------------------

/**
 * Compute the path for a given round + lens deliberation artifact.
 * Pure function so tests can assert without filesystem side effects.
 */
export function deliberationArtifactPath(
  deliberation_dir: string,
  round: DeliberationRoundNumber,
  lens_id: string,
): string {
  return path.join(deliberation_dir, `round${round}`, `${lens_id}-deliberation.md`);
}

/**
 * Write a deliberation artifact to disk, creating parent directories.
 * Returns the absolute path written.
 */
export async function writeDeliberationArtifact(
  deliberation_dir: string,
  round: DeliberationRoundNumber,
  lens_id: string,
  content: string,
): Promise<string> {
  const filePath = deliberationArtifactPath(deliberation_dir, round, lens_id);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

/**
 * Read a deliberation artifact. Returns `null` when the file does not
 * exist (not an error — synthesize step decides whether absence is
 * acceptable for a given lens / round pair).
 */
export async function readDeliberationArtifact(
  deliberation_dir: string,
  round: DeliberationRoundNumber,
  lens_id: string,
): Promise<string | null> {
  const filePath = deliberationArtifactPath(deliberation_dir, round, lens_id);
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Disagreement extraction
// ---------------------------------------------------------------------------

export interface Disagreement {
  /** Lens whose round 2 artifact surfaced the disagreement. */
  source_lens_id: string;
  /** Free-form title pulled from the "이견 항목" heading. */
  title: string;
  /** Verbatim body lines (trimmed) associated with this disagreement. */
  body: string;
}

const DISAGREEMENT_HEADING_PATTERNS = [
  /^##\s+지속적\s*이견\s*$/m,
  /^##\s+Persistent\s+Disagreements?\s*$/im,
] as const;

const ITEM_PREFIX = /^-\s+\*\*이견\s*항목\*\*\s*:\s*(.+?)\s*$/;

/**
 * Parse round-2 artifacts for a "지속적 이견" section and extract each
 * bullet labelled `**이견 항목**`. Other bullet content up to the next
 * `- **이견 항목**` entry (or end of section / next `##`) is captured
 * as body.
 *
 * Unknown / missing section → empty array. Lenient parsing by design:
 * lens agents may vary the exact punctuation.
 */
export function extractDisagreements(
  round2_artifacts: Array<{ lens_id: string; content: string }>,
): Disagreement[] {
  const out: Disagreement[] = [];
  for (const artifact of round2_artifacts) {
    const sectionContent = extractSection(artifact.content);
    if (!sectionContent) continue;
    const items = splitDisagreementItems(sectionContent);
    for (const item of items) {
      out.push({
        source_lens_id: artifact.lens_id,
        title: item.title,
        body: item.body,
      });
    }
  }
  return out;
}

function extractSection(content: string): string | null {
  for (const pattern of DISAGREEMENT_HEADING_PATTERNS) {
    const match = content.match(pattern);
    if (!match) continue;
    const start = match.index;
    if (typeof start !== "number") continue;
    const after = content.slice(start + match[0].length);
    // Cut at the next ## heading, if any.
    const nextHeading = after.search(/^##\s+/m);
    const section = nextHeading >= 0 ? after.slice(0, nextHeading) : after;
    return section.trim();
  }
  return null;
}

function splitDisagreementItems(section: string): Array<{ title: string; body: string }> {
  const items: Array<{ title: string; body: string }> = [];
  const lines = section.split("\n");
  let current: { title: string; bodyLines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(ITEM_PREFIX);
    if (match) {
      if (current) {
        items.push({ title: current.title, body: current.bodyLines.join("\n").trim() });
      }
      current = { title: match[1]!, bodyLines: [] };
      continue;
    }
    if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) {
    items.push({ title: current.title, body: current.bodyLines.join("\n").trim() });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Deliberation plan builder
// ---------------------------------------------------------------------------

/**
 * Build the step-by-step plan the coordinator follows. Pure — no
 * filesystem or spawn calls. Useful for logging / artifact recording
 * before the coordinator begins Claude-tool invocations.
 *
 * Round 1 steps are emitted first (one per lens), then round 2 (if
 * requested). Step ordering within a round is stable (matches
 * `input.lenses` order).
 */
export function buildDeliberationPlan(
  input: LensDeliberationInput,
  round1ContentBuilder: (lens: LensPrimaryOutput, others: LensPrimaryOutput[]) => string,
  round2ContentBuilder?: (lens: LensPrimaryOutput, others: LensPrimaryOutput[]) => string,
): DeliberationPlan {
  const steps: DeliberationRoundPlanStep[] = [];
  for (const lens of input.lenses) {
    const others = input.lenses.filter((l) => l.lens_id !== lens.lens_id);
    steps.push({
      round: 1,
      lens_id: lens.lens_id,
      prompt: round1ContentBuilder(lens, others),
      artifact_path: deliberationArtifactPath(input.deliberation_dir, 1, lens.lens_id),
    });
  }
  if (input.rounds >= 2 && round2ContentBuilder) {
    for (const lens of input.lenses) {
      const others = input.lenses.filter((l) => l.lens_id !== lens.lens_id);
      steps.push({
        round: 2,
        lens_id: lens.lens_id,
        prompt: round2ContentBuilder(lens, others),
        artifact_path: deliberationArtifactPath(input.deliberation_dir, 2, lens.lens_id),
      });
    }
  }
  return {
    steps,
    all_artifact_paths: steps.map((s) => s.artifact_path),
  };
}

// ---------------------------------------------------------------------------
// Orchestration entrypoint
// ---------------------------------------------------------------------------

export interface RunDeliberationArgs {
  ontoConfig: OntoConfig;
  input: LensDeliberationInput;
  env?: NodeJS.ProcessEnv;
  /**
   * Reads the lens's primary output from disk; injected for tests.
   * Defaults to `fs.readFile(...)`.
   */
  readPrimary?: (output_path: string) => Promise<string>;
}

/**
 * Produce the deliberation plan after verifying opt-in and reading lens
 * primary outputs. Does NOT invoke `TeamCreate` or `SendMessage` itself
 * — those are Claude tools the coordinator agent invokes. The returned
 * plan contains fully-formed prompts and target artifact paths.
 *
 * This separation keeps the TS test harness deterministic without needing
 * Claude Code runtime access: TS builds prompts + schema, Claude agent
 * executes tool calls.
 */
export async function runLensAgentDeliberation(
  args: RunDeliberationArgs,
): Promise<DeliberationPlan> {
  requireDeliberationOptIn(args.ontoConfig, args.env ?? process.env);
  const read = args.readPrimary ?? (async (p: string) => fs.readFile(p, "utf8"));
  const primaryBodies = await Promise.all(
    args.input.lenses.map(async (lens) => ({
      lens_id: lens.lens_id,
      content: await read(lens.output_path),
    })),
  );
  const bodyByLens = new Map(primaryBodies.map((p) => [p.lens_id, p.content]));

  const round1Builder = (
    own: LensPrimaryOutput,
    others: LensPrimaryOutput[],
  ): string => {
    const otherOutputs = others.map((o) => ({
      lens_id: o.lens_id,
      content: bodyByLens.get(o.lens_id) ?? "",
    }));
    const ownSummary = summarizeFirstParagraph(bodyByLens.get(own.lens_id) ?? "");
    return buildDeliberationRound1Prompt({
      own_lens_id: own.lens_id,
      own_output_summary: ownSummary,
      other_lens_outputs: otherOutputs,
    });
  };

  const round2Builder = (
    own: LensPrimaryOutput,
    _others: LensPrimaryOutput[],
  ): string => {
    // Round 2 prompt is built lazily (it depends on round-1 responses
    // that don't yet exist at plan-build time). For the plan, we emit
    // a PLACEHOLDER that the coordinator replaces with actual round-1
    // responses read from disk once round 1 completes.
    return buildDeliberationRound2Prompt({
      own_lens_id: own.lens_id,
      round1_responses: [
        {
          lens_id: "<placeholder>",
          content:
            "[coordinator-replace-at-runtime]: round 1 artifacts 를 읽어 모든 lens 의 응답을 여기에 삽입.",
        },
      ],
    });
  };

  return buildDeliberationPlan(
    args.input,
    round1Builder,
    args.input.rounds >= 2 ? round2Builder : undefined,
  );
}

function summarizeFirstParagraph(content: string): string {
  const paragraphs = content.split(/\n\s*\n/);
  const first = paragraphs[0]?.trim() ?? "";
  if (first.length <= 140) return first;
  return first.slice(0, 137) + "...";
}
