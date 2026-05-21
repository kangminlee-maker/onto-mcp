import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tryResolveTopologyForHandoff } from "./review-invoke.js";

// ---------------------------------------------------------------------------
// Coordinator handoff descriptor invariants (P9.3, 2026-04-21):
//
// (1) `tryResolveTopologyForHandoff` attempts axis-first resolution when
//     a review axis block exists.
// (2) Resolvable topology → non-null descriptor with all 6 static
//     attributes, minus plan_trace (handoff payload stays compact).
// (3) Descriptor is JSON-serializable with deterministic shape —
//     downstream coordinator consumers parse it unmodified.
// (4) Returns null when ontoConfig is undefined or the resolver itself
//     reports `no_host`.
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    process.env[k] = v;
  }
}

describe("tryResolveTopologyForHandoff — null paths", () => {
  beforeEach(() => {
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  });
  afterEach(restoreEnv);

  it("undefined ontoConfig → null (defensive guard)", () => {
    expect(tryResolveTopologyForHandoff(undefined)).toBeNull();
  });

  it("no host signals → null (resolver returns no_host)", () => {
    expect(tryResolveTopologyForHandoff({})).toBeNull();
  });

  it("review block declares unreachable subagent → null", () => {
    expect(
      tryResolveTopologyForHandoff({
        review: {
          subagent: { provider: "codex", model_id: "gpt-5.4" },
        },
      }),
    ).toBeNull();
  });
});

describe("tryResolveTopologyForHandoff — always-on axis-first (P9.3)", () => {
  beforeEach(() => {
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  });
  afterEach(restoreEnv);

  it("plain CC session without review block → null", () => {
    process.env.CLAUDECODE = "1";
    const descriptor = tryResolveTopologyForHandoff({});
    expect(descriptor).toBeNull();
  });

  it("empty `review: {}` resolves through explicit review defaults under CC host", () => {
    process.env.CLAUDECODE = "1";
    const descriptor = tryResolveTopologyForHandoff({
      review: {} as never,
    });
    expect(descriptor).not.toBeNull();
    expect(descriptor!.id).toBe("cc-main-agent-subagent");
  });
});

describe("tryResolveTopologyForHandoff — resolved descriptor", () => {
  beforeEach(() => {
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  });
  afterEach(restoreEnv);

  it("cc-main-agent-subagent resolves to descriptor with 6 static attributes", () => {
    process.env.CLAUDECODE = "1";
    const descriptor = tryResolveTopologyForHandoff({
      review: { subagent: { provider: "main-native" } },
    });
    expect(descriptor).not.toBeNull();
    expect(descriptor!.id).toBe("cc-main-agent-subagent");
    expect(descriptor!.teamlead_location).toBe("onto-main");
    expect(descriptor!.lens_spawn_mechanism).toBe("claude-agent-tool");
    expect(descriptor!.max_concurrent_lenses).toBe(10);
    expect(descriptor!.transport_rank).toBe("S2");
    expect(descriptor!.deliberation_channel).toBe("controlled-lens-deliberation");
  });

  it("cc-teams-lens-agent-deliberation resolves when triple opt-in met", () => {
    process.env.CLAUDECODE = "1";
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
    // P9.2 (2026-04-21): deliberation topology is selected through the
    // `config.review` axis block (`lens_deliberation: controlled-lens-deliberation`)
    // + `lens_agent_teams_mode: true` double opt-in.
    const descriptor = tryResolveTopologyForHandoff({
      review: {
        subagent: { provider: "main-native" },
        lens_deliberation: "controlled-lens-deliberation",
      },
      lens_agent_teams_mode: true,
    });
    expect(descriptor).not.toBeNull();
    expect(descriptor!.id).toBe("cc-teams-lens-agent-deliberation");
    expect(descriptor!.deliberation_channel).toBe("controlled-lens-deliberation");
    expect(descriptor!.lens_spawn_mechanism).toBe("claude-teamcreate-member");
  });

  it("descriptor does NOT include plan_trace (compact handoff JSON)", () => {
    process.env.CLAUDECODE = "1";
    const descriptor = tryResolveTopologyForHandoff({
      review: { subagent: { provider: "main-native" } },
    });
    expect(descriptor).not.toBeNull();
    expect(Object.keys(descriptor!)).not.toContain("plan_trace");
  });

  it("descriptor is JSON round-trip stable", () => {
    process.env.CLAUDECODE = "1";
    const descriptor = tryResolveTopologyForHandoff({
      review: { subagent: { provider: "main-native" } },
    });
    const json = JSON.stringify(descriptor);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(descriptor);
  });
});
