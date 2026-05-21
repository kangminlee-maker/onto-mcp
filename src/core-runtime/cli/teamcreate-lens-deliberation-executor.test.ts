import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DeliberationOptInError,
  buildDeliberationPlan,
  buildDeliberationRound1Prompt,
  buildDeliberationRound2Prompt,
  deliberationArtifactPath,
  extractDisagreements,
  readDeliberationArtifact,
  requireDeliberationOptIn,
  runLensAgentDeliberation,
  writeDeliberationArtifact,
  type LensPrimaryOutput,
} from "./teamcreate-lens-deliberation-executor.js";

// ---------------------------------------------------------------------------
// These tests assert controlled deliberation protocol invariants:
//
// (1) Triple opt-in is enforced at module boundary — missing any of
//     CLAUDECODE, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, or
//     config.lens_agent_teams_mode throws DeliberationOptInError with
//     the missing items enumerated.
// (2) Round 1 prompt embeds OTHER lens outputs (not own), asks for
//     re-evaluation, declares the required response section headings.
// (3) Round 2 prompt embeds ALL round-1 responses, asks for convergence
//     + explicit persistent disagreements.
// (4) Artifact paths are deterministic: <dir>/round{N}/<lens>-deliberation.md.
// (5) Read/write round-trip preserves content.
// (6) Disagreement extraction finds "## 지속적 이견" sections, parses
//     "- **이견 항목**:" entries, tolerates English variant heading.
// (7) runLensAgentDeliberation produces a plan with N*round steps in
//     stable order, each with prompt + artifact_path populated.
// ---------------------------------------------------------------------------

const LENSES: LensPrimaryOutput[] = [
  { lens_id: "logic", output_path: "/tmp/fake/round0/logic.md" },
  { lens_id: "pragmatics", output_path: "/tmp/fake/round0/pragmatics.md" },
  { lens_id: "axiology", output_path: "/tmp/fake/round0/axiology.md" },
];

// ---------------------------------------------------------------------------
// requireDeliberationOptIn
// ---------------------------------------------------------------------------

describe("requireDeliberationOptIn", () => {
  it("passes when all three flags satisfied", () => {
    expect(() =>
      requireDeliberationOptIn(
        { lens_agent_teams_mode: true },
        {
          CLAUDECODE: "1",
          CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
        },
      ),
    ).not.toThrow();
  });

  it("throws with CLAUDECODE missing", () => {
    try {
      requireDeliberationOptIn(
        { lens_agent_teams_mode: true },
        { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
      );
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DeliberationOptInError);
      expect((err as DeliberationOptInError).missing.join("\n")).toContain("CLAUDECODE=1");
    }
  });

  it("throws with experimental flag missing", () => {
    try {
      requireDeliberationOptIn(
        { lens_agent_teams_mode: true },
        { CLAUDECODE: "1" },
      );
      expect.fail("expected throw");
    } catch (err) {
      const m = (err as DeliberationOptInError).missing.join("\n");
      expect(m).toContain("EXPERIMENTAL_AGENT_TEAMS");
    }
  });

  it("throws with config.lens_agent_teams_mode missing", () => {
    try {
      requireDeliberationOptIn(
        {},
        {
          CLAUDECODE: "1",
          CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
        },
      );
      expect.fail("expected throw");
    } catch (err) {
      const m = (err as DeliberationOptInError).missing.join("\n");
      expect(m).toContain("lens_agent_teams_mode");
    }
  });

  it("message enumerates ALL missing flags (not just the first)", () => {
    try {
      requireDeliberationOptIn({ lens_agent_teams_mode: false }, {});
      expect.fail("expected throw");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("CLAUDECODE=1");
      expect(msg).toContain("EXPERIMENTAL_AGENT_TEAMS");
      expect(msg).toContain("lens_agent_teams_mode");
    }
  });
});

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

describe("buildDeliberationRound1Prompt", () => {
  it("embeds every OTHER lens output as its own block", () => {
    const prompt = buildDeliberationRound1Prompt({
      own_lens_id: "logic",
      own_output_summary: "logic 의 기존 결론",
      other_lens_outputs: [
        { lens_id: "pragmatics", content: "pragmatics output body" },
        { lens_id: "axiology", content: "axiology output body" },
      ],
    });
    expect(prompt).toContain("## Lens: pragmatics");
    expect(prompt).toContain("pragmatics output body");
    expect(prompt).toContain("## Lens: axiology");
    expect(prompt).toContain("axiology output body");
  });

  it("does NOT embed the lens's own output verbatim (it's already in its session memory)", () => {
    const prompt = buildDeliberationRound1Prompt({
      own_lens_id: "logic",
      own_output_summary: "summary of logic body",
      other_lens_outputs: [{ lens_id: "pragmatics", content: "other body" }],
    });
    expect(prompt).toContain("summary of logic body");
    expect(prompt).not.toContain("## Lens: logic");
  });

  it("declares the required response section headings", () => {
    const prompt = buildDeliberationRound1Prompt({
      own_lens_id: "logic",
      own_output_summary: "x",
      other_lens_outputs: [],
    });
    expect(prompt).toContain("재평가 요약");
    expect(prompt).toContain("동의/강화 지점");
    expect(prompt).toContain("충돌/수정 지점");
    expect(prompt).toContain("추가 발견");
  });
});

describe("buildDeliberationRound2Prompt", () => {
  it("embeds all round-1 responses", () => {
    const prompt = buildDeliberationRound2Prompt({
      own_lens_id: "logic",
      round1_responses: [
        { lens_id: "logic", content: "logic r1" },
        { lens_id: "pragmatics", content: "pragmatics r1" },
      ],
    });
    expect(prompt).toContain("Round 1 response — lens: logic");
    expect(prompt).toContain("Round 1 response — lens: pragmatics");
    expect(prompt).toContain("logic r1");
    expect(prompt).toContain("pragmatics r1");
  });

  it("declares required round-2 section headings (수렴 / 이견 / 최종)", () => {
    const prompt = buildDeliberationRound2Prompt({
      own_lens_id: "logic",
      round1_responses: [],
    });
    expect(prompt).toContain("수렴 요약");
    expect(prompt).toContain("지속적 이견");
    expect(prompt).toContain("최종 입장");
  });

  it("explicitly instructs NOT to hide disagreement", () => {
    const prompt = buildDeliberationRound2Prompt({
      own_lens_id: "logic",
      round1_responses: [],
    });
    expect(prompt).toContain("숨기지");
  });
});

// ---------------------------------------------------------------------------
// Artifact path / read / write
// ---------------------------------------------------------------------------

describe("deliberationArtifactPath", () => {
  it("composes <dir>/round{N}/<lens>-deliberation.md", () => {
    expect(deliberationArtifactPath("/base", 1, "logic")).toBe(
      path.join("/base", "round1", "logic-deliberation.md"),
    );
    expect(deliberationArtifactPath("/base", 2, "axiology")).toBe(
      path.join("/base", "round2", "axiology-deliberation.md"),
    );
  });
});

describe("writeDeliberationArtifact / readDeliberationArtifact", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-deliberation-"));
  });
  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("round-trips content through disk, creating parent directories", async () => {
    const content = "## 재평가 요약\n\n유지.\n";
    const filePath = await writeDeliberationArtifact(tmpRoot, 1, "logic", content);
    expect(filePath).toBe(deliberationArtifactPath(tmpRoot, 1, "logic"));
    const read = await readDeliberationArtifact(tmpRoot, 1, "logic");
    expect(read).toBe(content);
  });

  it("readDeliberationArtifact returns null for missing artifact (not an error)", async () => {
    const read = await readDeliberationArtifact(tmpRoot, 2, "never-written");
    expect(read).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractDisagreements
// ---------------------------------------------------------------------------

describe("extractDisagreements", () => {
  it("extracts items from a '## 지속적 이견' section", () => {
    const round2 = [
      {
        lens_id: "logic",
        content: [
          "## 수렴 요약",
          "- 모두 동의",
          "",
          "## 지속적 이견",
          "- **이견 항목**: scope creep 정의",
          "  - 당신의 입장: task 내 한정",
          "  - 반대 입장 (axiology): 가치 질문 포함 필요",
          "- **이견 항목**: severity 스케일",
          "  - 당신의 입장: 3단계",
          "  - 반대 입장 (pragmatics): 5단계",
          "",
          "## 최종 입장",
          "입장 유지.",
        ].join("\n"),
      },
    ];
    const result = extractDisagreements(round2);
    expect(result).toHaveLength(2);
    expect(result[0]!.source_lens_id).toBe("logic");
    expect(result[0]!.title).toBe("scope creep 정의");
    expect(result[0]!.body).toContain("task 내 한정");
    expect(result[1]!.title).toBe("severity 스케일");
  });

  it("empty section yields empty array", () => {
    const round2 = [
      { lens_id: "logic", content: "## 수렴 요약\n- OK\n\n## 최종 입장\n입장 유지." },
    ];
    expect(extractDisagreements(round2)).toEqual([]);
  });

  it("tolerates English heading 'Persistent Disagreements'", () => {
    const round2 = [
      {
        lens_id: "pragmatics",
        content: [
          "## Persistent Disagreements",
          "- **이견 항목**: naming convention",
          "  - details here",
        ].join("\n"),
      },
    ];
    const result = extractDisagreements(round2);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("naming convention");
  });

  it("stops at the next ## heading", () => {
    const round2 = [
      {
        lens_id: "logic",
        content: [
          "## 지속적 이견",
          "- **이견 항목**: X",
          "  - detail",
          "## 최종 입장",
          "- **이견 항목**: should-not-appear",
        ].join("\n"),
      },
    ];
    const result = extractDisagreements(round2);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("X");
  });

  it("aggregates across multiple round-2 artifacts", () => {
    const round2 = [
      {
        lens_id: "logic",
        content: "## 지속적 이견\n- **이견 항목**: A\n  - body A",
      },
      {
        lens_id: "pragmatics",
        content: "## 지속적 이견\n- **이견 항목**: B\n  - body B",
      },
    ];
    const result = extractDisagreements(round2);
    expect(result).toHaveLength(2);
    expect(result.map((d) => `${d.source_lens_id}:${d.title}`)).toEqual([
      "logic:A",
      "pragmatics:B",
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildDeliberationPlan
// ---------------------------------------------------------------------------

describe("buildDeliberationPlan", () => {
  it("emits N round-1 steps when rounds=1", () => {
    const plan = buildDeliberationPlan(
      { lenses: LENSES, deliberation_dir: "/tmp/d", rounds: 1 },
      (lens) => `round1-prompt-for-${lens.lens_id}`,
    );
    expect(plan.steps).toHaveLength(3);
    for (let i = 0; i < 3; i += 1) {
      expect(plan.steps[i]!.round).toBe(1);
      expect(plan.steps[i]!.lens_id).toBe(LENSES[i]!.lens_id);
      expect(plan.steps[i]!.prompt).toContain(LENSES[i]!.lens_id);
    }
  });

  it("emits 2N steps when rounds=2 with round1 before round2", () => {
    const plan = buildDeliberationPlan(
      { lenses: LENSES, deliberation_dir: "/tmp/d", rounds: 2 },
      (lens) => `round1-${lens.lens_id}`,
      (lens) => `round2-${lens.lens_id}`,
    );
    expect(plan.steps).toHaveLength(6);
    expect(plan.steps.slice(0, 3).every((s) => s.round === 1)).toBe(true);
    expect(plan.steps.slice(3).every((s) => s.round === 2)).toBe(true);
  });

  it("all_artifact_paths lists every step's target", () => {
    const plan = buildDeliberationPlan(
      { lenses: LENSES, deliberation_dir: "/tmp/d", rounds: 2 },
      (lens) => `r1-${lens.lens_id}`,
      (lens) => `r2-${lens.lens_id}`,
    );
    expect(plan.all_artifact_paths).toHaveLength(6);
    expect(plan.all_artifact_paths[0]).toContain("round1");
    expect(plan.all_artifact_paths[3]).toContain("round2");
  });
});

// ---------------------------------------------------------------------------
// runLensAgentDeliberation
// ---------------------------------------------------------------------------

describe("runLensAgentDeliberation", () => {
  const VALID_ENV = {
    CLAUDECODE: "1",
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
  };

  it("throws DeliberationOptInError when opt-in not met", async () => {
    await expect(
      runLensAgentDeliberation({
        ontoConfig: {},
        input: { lenses: LENSES, deliberation_dir: "/tmp/d", rounds: 1 },
        env: {},
      }),
    ).rejects.toThrow(DeliberationOptInError);
  });

  it("reads primary lens outputs via injected reader and builds round-1 prompts", async () => {
    const primaries = new Map([
      ["logic", "LOGIC primary output body with findings."],
      ["pragmatics", "PRAG primary output body."],
      ["axiology", "AXIOLOGY primary output body."],
    ]);
    const plan = await runLensAgentDeliberation({
      ontoConfig: { lens_agent_teams_mode: true },
      input: { lenses: LENSES, deliberation_dir: "/tmp/d", rounds: 1 },
      env: VALID_ENV,
      readPrimary: async (p) => {
        const lensId = path.basename(p).replace(".md", "");
        return primaries.get(lensId) ?? "";
      },
    });

    expect(plan.steps).toHaveLength(3);
    // Logic's prompt should contain PRAG + AXIOLOGY bodies (as "other" blocks)
    // but should NOT include a "## Lens: logic" block — logic's own body
    // stays in its session memory. The own_output_summary header may
    // echo a truncated first paragraph (that's the name anchor) which
    // is intentional; we check the block-shaped inclusion only.
    const logicStep = plan.steps.find((s) => s.lens_id === "logic")!;
    expect(logicStep.prompt).toContain("PRAG primary output body");
    expect(logicStep.prompt).toContain("AXIOLOGY primary output body");
    expect(logicStep.prompt).not.toContain("## Lens: logic");
  });

  it("rounds=2 produces round-1 + round-2 steps (round-2 prompt has runtime placeholder)", async () => {
    const plan = await runLensAgentDeliberation({
      ontoConfig: { lens_agent_teams_mode: true },
      input: { lenses: LENSES, deliberation_dir: "/tmp/d", rounds: 2 },
      env: VALID_ENV,
      readPrimary: async () => "primary body",
    });
    expect(plan.steps).toHaveLength(6);
    const round2Step = plan.steps.find((s) => s.round === 2)!;
    expect(round2Step.prompt).toContain("coordinator-replace-at-runtime");
  });
});
