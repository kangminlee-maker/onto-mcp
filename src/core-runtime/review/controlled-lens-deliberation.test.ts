import { describe, expect, it } from "vitest";
import {
  buildLensControlledDeliberationPrompt,
  buildTeamleadControlledDeliberationPrompt,
} from "./controlled-lens-deliberation.js";

describe("controlled lens deliberation prompts", () => {
  it("uses required refs instead of embedding primary lens output bodies", () => {
    const prompt = buildLensControlledDeliberationPrompt({
      session_id: "session-1",
      lens_id: "logic",
      output_path: ".onto/review/session-1/deliberation/logic.md",
      own_output: {
        lens_id: "logic",
        output_path: ".onto/review/session-1/round1/logic.md",
      },
      other_outputs: [
        {
          lens_id: "structure",
          output_path: ".onto/review/session-1/round1/structure.md",
        },
      ],
      issue_artifact_context:
        "- finding-ledger: .onto/review/session-1/finding-ledger.yaml",
      boundary_context:
        '## Unit Boundary Details\n```json\n{"output_seat":{"output_path":".onto/review/session-1/deliberation/logic.md"}}\n```',
    });

    expect(prompt).toContain("## Boundary Policy");
    expect(prompt).toContain("- tools: required");
    expect(prompt).toContain("- source mutation: denied");
    expect(prompt).toContain(
      "- write output only to: .onto/review/session-1/deliberation/logic.md",
    );
    expect(prompt).toContain("## Unit Boundary Details");
    expect(prompt).toContain('"output_seat"');
    expect(prompt).toContain(
      "- own primary lens output: .onto/review/session-1/round1/logic.md",
    );
    expect(prompt).toContain(
      "- structure: .onto/review/session-1/round1/structure.md",
    );
    expect(prompt).not.toContain("## Embedded Lens Outputs");
  });

  it("uses response refs for teamlead deliberation", () => {
    const prompt = buildTeamleadControlledDeliberationPrompt({
      session_id: "session-1",
      output_path: ".onto/review/session-1/deliberation.md",
      lens_outputs: [
        {
          lens_id: "logic",
          output_path: ".onto/review/session-1/round1/logic.md",
        },
      ],
      lens_deliberation_responses: [
        {
          lens_id: "logic",
          response_path: ".onto/review/session-1/deliberation/logic.md",
        },
      ],
      issue_artifact_context:
        "- issue-ledger: .onto/review/session-1/issue-ledger.yaml",
      boundary_context:
        '## Unit Boundary Details\n```json\n{"output_seat":{"output_path":".onto/review/session-1/deliberation.md"}}\n```',
    });

    expect(prompt).toContain("- tools: required");
    expect(prompt).toContain("- source mutation: denied");
    expect(prompt).toContain("- write output only to: .onto/review/session-1/deliberation.md");
    expect(prompt).toContain("## Unit Boundary Details");
    expect(prompt).toContain('"output_seat"');
    expect(prompt).toContain("- logic: .onto/review/session-1/round1/logic.md");
    expect(prompt).toContain("- logic: .onto/review/session-1/deliberation/logic.md");
    expect(prompt).not.toContain("## Primary Lens Outputs\n###");
    expect(prompt).not.toContain("## Lens Deliberation Responses\n###");
  });
});
