import { describe, it, expect } from "vitest";
import {
  parsePacketAllowedReadAuthority,
  parsePacketAllowedReadRefs,
  parsePacketBoundaryPolicy,
} from "./packet-boundary-policy.js";

describe("parsePacketBoundaryPolicy — section detection", () => {
  it("returns all-unknown when no Boundary Policy section exists", () => {
    const policy = parsePacketBoundaryPolicy("# Prompt\n\nNo policy section here.");
    expect(policy.filesystem).toBe("unknown");
    expect(policy.network).toBe("unknown");
    expect(policy.tools).toBe("unknown");
    expect(policy.sectionBody).toBeUndefined();
  });

  it("matches case-insensitive heading", () => {
    const packet = "# Prompt\n\n## boundary policy\n- Filesystem: denied\n";
    const policy = parsePacketBoundaryPolicy(packet);
    expect(policy.filesystem).toBe("denied");
  });

  it("stops section body at the next heading", () => {
    const packet = [
      "## Boundary Policy",
      "- Filesystem: denied",
      "",
      "## Other Section",
      "- Filesystem: allowed  ",
    ].join("\n");
    const policy = parsePacketBoundaryPolicy(packet);
    expect(policy.filesystem).toBe("denied");
  });

  it("ignores Boundary Policy headings inside embedded materialized input", () => {
    const packet = [
      "# Packet",
      "",
      "## Embedded Materialized Input",
      "```markdown",
      "## Boundary Policy",
      "- Filesystem: denied",
      "- Tools: denied",
      "```",
      "",
      "## Boundary Policy",
      "- Filesystem: read-only",
      "- Tools: optional",
    ].join("\n");
    const policy = parsePacketBoundaryPolicy(packet);
    expect(policy.filesystem).toBe("allowed");
    expect(policy.tools).toBe("optional");
  });

  it("rejects unmarked embedded materialized input instead of guessing legacy boundaries", () => {
    const packet = [
      "# Packet",
      "",
      "## Embedded Materialized Input",
      "Target text can be raw markdown.",
      "## Boundary Policy",
      "- Filesystem: denied",
      "- Tools: denied",
      "## Unit Boundary Details",
      "```json",
      JSON.stringify({
        unit_boundary: {
          read_authority: { allowed_read_refs: ["target-content.md"] },
        },
      }),
      "```",
      "",
      "## Optional Context Inputs",
      "- session metadata: .onto/review/session/session-metadata.yaml",
      "",
      "## Boundary Policy",
      "- Filesystem: read-only",
      "- Tools: optional",
    ].join("\n");
    expect(() => parsePacketBoundaryPolicy(packet)).toThrow(
      "Embedded Materialized Input must use onto line-count markers or a fenced block.",
    );
  });

  it("uses the embedded materialized input line-count marker before packet headings", () => {
    const packet = [
      "# Packet",
      "",
      "## Embedded Materialized Input",
      "<!-- onto:embedded-materialized-input:start lines=5 -->",
      "Target content can contain packet-like headings.",
      "## Optional Context Inputs",
      "## Boundary Policy",
      "- Filesystem: denied",
      "- Tools: denied",
      "<!-- onto:embedded-materialized-input:end -->",
      "",
      "## Optional Context Inputs",
      "- session metadata: .onto/review/session/session-metadata.yaml",
      "",
      "## Boundary Policy",
      "- Filesystem: read-only",
      "- Tools: optional",
    ].join("\n");
    const policy = parsePacketBoundaryPolicy(packet);
    expect(policy.filesystem).toBe("allowed");
    expect(policy.tools).toBe("optional");
  });
});

describe("parsePacketBoundaryPolicy — filesystem (A1 regression)", () => {
  it("detects denied", () => {
    const p = parsePacketBoundaryPolicy("## Boundary Policy\n- Filesystem: denied");
    expect(p.filesystem).toBe("denied");
    expect(p.filesystemRaw).toBe("denied");
  });

  it("detects allowed via read-only compound phrase", () => {
    const p = parsePacketBoundaryPolicy(
      "## Boundary Policy\n- Filesystem: read-only inside round1/ (lens outputs only)",
    );
    expect(p.filesystem).toBe("allowed");
  });

  it("returns unknown for unrecognised value", () => {
    const p = parsePacketBoundaryPolicy("## Boundary Policy\n- Filesystem: whatever");
    expect(p.filesystem).toBe("unknown");
  });
});

describe("parsePacketBoundaryPolicy — tools (A4)", () => {
  it("detects Tools: required", () => {
    const p = parsePacketBoundaryPolicy("## Boundary Policy\n- Tools: required");
    expect(p.tools).toBe("required");
    expect(p.toolsRaw).toBe("required");
  });

  it("detects required via synonyms (mandatory, needed, must)", () => {
    for (const v of ["mandatory", "needed", "must"]) {
      const p = parsePacketBoundaryPolicy(`## Boundary Policy\n- Tools: ${v}`);
      expect(p.tools).toBe("required");
    }
  });

  it("detects Tools: optional", () => {
    const p = parsePacketBoundaryPolicy("## Boundary Policy\n- Tools: optional");
    expect(p.tools).toBe("optional");
  });

  it("detects Tools: denied", () => {
    const p = parsePacketBoundaryPolicy("## Boundary Policy\n- Tools: denied");
    expect(p.tools).toBe("denied");
  });

  it("detects required via compound phrase (first token)", () => {
    const p = parsePacketBoundaryPolicy(
      "## Boundary Policy\n- Tools: required — lens outputs must be fetched via read_file",
    );
    expect(p.tools).toBe("required");
  });

  it("is case-insensitive on the key", () => {
    const p = parsePacketBoundaryPolicy("## Boundary Policy\n- TOOLS: Required");
    expect(p.tools).toBe("required");
  });

  it("returns unknown when Tools bullet is absent", () => {
    const p = parsePacketBoundaryPolicy("## Boundary Policy\n- Filesystem: denied");
    expect(p.tools).toBe("unknown");
    expect(p.toolsRaw).toBeUndefined();
  });

  it("returns unknown for unrecognised value", () => {
    const p = parsePacketBoundaryPolicy("## Boundary Policy\n- Tools: sometimes");
    expect(p.tools).toBe("unknown");
  });
});

describe("parsePacketBoundaryPolicy — combined declarations", () => {
  it("parses filesystem + network + tools together", () => {
    const packet = [
      "## Boundary Policy",
      "- Filesystem: read-only inside round1/",
      "- Network: denied",
      "- Tools: required",
    ].join("\n");
    const p = parsePacketBoundaryPolicy(packet);
    expect(p.filesystem).toBe("allowed");
    expect(p.network).toBe("denied");
    expect(p.tools).toBe("required");
  });

  it("detects contradictory declaration (denied filesystem + required tools) raw but classifies each correctly", () => {
    // The parser itself does NOT enforce internal consistency — it just
    // reports what the packet said. The executor is responsible for rejecting
    // impossible combinations.
    const packet = [
      "## Boundary Policy",
      "- Filesystem: denied",
      "- Tools: required",
    ].join("\n");
    const p = parsePacketBoundaryPolicy(packet);
    expect(p.filesystem).toBe("denied");
    expect(p.tools).toBe("required");
  });
});

describe("parsePacketAllowedReadRefs", () => {
  it("extracts allowed_read_refs from unit boundary details", () => {
    const refs = parsePacketAllowedReadRefs(
      [
        "## Unit Boundary Details",
        "```json",
        JSON.stringify({
          unit_boundary: {
            read_authority: {
              allowed_read_refs: [
                ".onto/review/session/round1/logic.md",
                ".onto/review/session/deliberation.md",
              ],
            },
          },
        }),
        "```",
      ].join("\n"),
    );

    expect(refs).toEqual([
      ".onto/review/session/deliberation.md",
      ".onto/review/session/round1/logic.md",
    ]);
  });

  it("fails closed when multiple unit boundary details sections are present", () => {
    const refs = parsePacketAllowedReadRefs(
      [
        "## Unit Boundary Details",
        "```json",
        JSON.stringify({
          unit_boundary: {
            read_authority: {
              allowed_read_refs: ["target.md"],
            },
          },
        }),
        "```",
        "",
        "## Runtime Unit Boundary Details",
        "```json",
        JSON.stringify({
          unit_boundary: {
            read_authority: {
              allowed_read_refs: ["round1/logic.md"],
            },
          },
        }),
        "```",
      ].join("\n"),
    );

    expect(refs).toEqual([]);
  });

  it("keeps compatibility helper fail-closed to an empty ref list", () => {
    expect(
      parsePacketAllowedReadRefs("## Boundary Details\n```json\n{nope\n```"),
    ).toEqual([]);
  });
});

describe("parsePacketAllowedReadAuthority", () => {
  it("reports missing boundary details separately from malformed details", () => {
    expect(parsePacketAllowedReadAuthority("# Packet\n\nNo boundary details.")).toEqual({
      declared: false,
      malformed: false,
      refs: [],
    });
  });

  it("marks malformed JSON as declared and malformed", () => {
    expect(
      parsePacketAllowedReadAuthority("## Unit Boundary Details\n```json\n{nope\n```"),
    ).toEqual({
      declared: true,
      malformed: true,
      refs: [],
    });
  });

  it("marks missing read_authority as malformed", () => {
    expect(
      parsePacketAllowedReadAuthority(
        [
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({ unit_boundary: { output_seat: {} } }),
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      declared: true,
      malformed: true,
      refs: [],
    });
  });

  it("marks missing allowed_read_refs as malformed", () => {
    expect(
      parsePacketAllowedReadAuthority(
        [
          "## Runtime Unit Boundary Details",
          "```json",
          JSON.stringify({ unit_boundary: { read_authority: {} } }),
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      declared: true,
      malformed: true,
      refs: [],
    });
  });

  it("marks mixed valid and invalid allowed_read_refs as malformed", () => {
    expect(
      parsePacketAllowedReadAuthority(
        [
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: {
                allowed_read_refs: ["target.md", 42],
              },
            },
          }),
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      declared: true,
      malformed: true,
      refs: [],
    });
  });

  it("marks blank allowed_read_refs entries as malformed", () => {
    expect(
      parsePacketAllowedReadAuthority(
        [
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: {
                allowed_read_refs: ["target.md", "   "],
              },
            },
          }),
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      declared: true,
      malformed: true,
      refs: [],
    });
  });

  it("allows an explicitly empty allowed_read_refs list to remain well-formed", () => {
    expect(
      parsePacketAllowedReadAuthority(
        [
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: { allowed_read_refs: [] },
            },
          }),
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      declared: true,
      malformed: false,
      refs: [],
    });
  });

  it("extracts unit id and output seat metadata from boundary details", () => {
    expect(
      parsePacketAllowedReadAuthority(
        [
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              unit_id: "logic",
              read_authority: {
                allowed_read_refs: ["target.md", "target.md"],
              },
              output_seat: {
                output_path: ".onto/review/session/round1/logic.md",
                allowed_output_refs: [
                  ".onto/review/session/round1/logic.md",
                  ".onto/review/session/round1/logic.md",
                ],
              },
            },
          }),
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      declared: true,
      malformed: false,
      refs: ["target.md"],
      unit_id: "logic",
      output_path: ".onto/review/session/round1/logic.md",
      allowed_output_refs: [".onto/review/session/round1/logic.md"],
    });
  });

  it("marks duplicate boundary detail sections as malformed", () => {
    expect(
      parsePacketAllowedReadAuthority(
        [
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: { allowed_read_refs: ["target.md"] },
            },
          }),
          "```",
          "",
          "## Runtime Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: { allowed_read_refs: ["round1/logic.md"] },
            },
          }),
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      declared: true,
      malformed: true,
      refs: [],
      section_count: 2,
      duplicate_sections: true,
    });
  });

  it("ignores Unit Boundary Details inside embedded materialized input", () => {
    expect(
      parsePacketAllowedReadAuthority(
        [
          "# Packet",
          "",
          "## Materialized Input",
          "```markdown",
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: { allowed_read_refs: ["target-content.md"] },
            },
          }),
          "```",
          "```",
          "",
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: { allowed_read_refs: ["packet-authority.md"] },
            },
          }),
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      declared: true,
      malformed: false,
      refs: ["packet-authority.md"],
    });
  });

  it("rejects unmarked embedded materialized input before reading Unit Boundary Details", () => {
    expect(() =>
      parsePacketAllowedReadAuthority(
        [
          "# Packet",
          "",
          "## Embedded Materialized Input",
          "Target text can be raw markdown.",
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: { allowed_read_refs: ["target-content.md"] },
            },
          }),
          "```",
          "",
          "## Optional Context Inputs",
          "- session metadata: .onto/review/session/session-metadata.yaml",
          "",
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: { allowed_read_refs: ["packet-authority.md"] },
            },
          }),
          "```",
        ].join("\n"),
      ),
    ).toThrow(
      "Embedded Materialized Input must use onto line-count markers or a fenced block.",
    );
  });

  it("ignores line-count marked Unit Boundary Details inside embedded materialized input", () => {
    expect(
      parsePacketAllowedReadAuthority(
        [
          "# Packet",
          "",
          "## Embedded Materialized Input",
          "<!-- onto:embedded-materialized-input:start lines=6 -->",
          "Target content can contain packet-like headings.",
          "## Optional Context Inputs",
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: { allowed_read_refs: ["target-content.md"] },
            },
          }),
          "```",
          "<!-- onto:embedded-materialized-input:end -->",
          "",
          "## Optional Context Inputs",
          "- session metadata: .onto/review/session/session-metadata.yaml",
          "",
          "## Unit Boundary Details",
          "```json",
          JSON.stringify({
            unit_boundary: {
              read_authority: { allowed_read_refs: ["packet-authority.md"] },
            },
          }),
          "```",
        ].join("\n"),
      ),
    ).toEqual({
      declared: true,
      malformed: false,
      refs: ["packet-authority.md"],
    });
  });
});
