import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SALVAGE_INCOMPLETE_SENTINEL,
  buildDeltaRowsSalvagePrompt,
  buildTranscriptionSalvagePrompt,
  classifySalvageMode,
  mergeMissingStanceRows,
  salvageInputPathFor,
} from "./submit-salvage.js";
import { writeRuntimeSubmitArtifactFromPayload } from "./worker-structured-output.js";
import type { RuntimeSubmitState } from "./runtime-submit-context.js";

const MISSING_ROWS_ERROR =
  "submit_issue_stance_response is missing issue_id(s): issue-021";

function stanceRow(issueId: string): Record<string, unknown> {
  return {
    issue_id: issueId,
    stance: "support",
    rationale: `lens rationale for ${issueId}`,
    root_hypothesis_position: "accepts",
    severity_position: "keeps",
    evidence_refs: [`issue-ledger.yaml#${issueId}`],
  };
}

describe("classifySalvageMode", () => {
  it("routes partial stance submissions with named missing rows to delta completion (S2)", () => {
    const mode = classifySalvageMode({
      outputFormat: "issue-stance-response",
      payload: { stances: [stanceRow("issue-001")] },
      resultText: null,
      error: MISSING_ROWS_ERROR,
    });
    expect(mode).toEqual({ mode: "delta_rows", missingIssueIds: ["issue-021"] });
  });

  it("routes payloads with field-level violations to transcription (S3)", () => {
    const mode = classifySalvageMode({
      outputFormat: "issue-stance-response",
      payload: { stances: [{ issue_id: "issue-001" }] },
      resultText: null,
      error: "submit_issue_stance_response.stances[0].stance must be a string",
    });
    expect(mode).toEqual({ mode: "transcription" });
  });

  it("keeps non-stance formats on transcription even for missing-row-shaped errors", () => {
    const mode = classifySalvageMode({
      outputFormat: "issue-deliberation-response",
      payload: { changed: false },
      resultText: null,
      error: MISSING_ROWS_ERROR,
    });
    expect(mode).toEqual({ mode: "transcription" });
  });

  it("routes prose-only frozen output to transcription (S1)", () => {
    const mode = classifySalvageMode({
      outputFormat: "issue-stance-response",
      payload: null,
      resultText: "I support issue-001 because ...",
      error: "claude result contained no structured payload",
    });
    expect(mode).toEqual({ mode: "transcription" });
  });

  it("declares unsalvageable when neither payload nor text exists", () => {
    const mode = classifySalvageMode({
      outputFormat: "issue-stance-response",
      payload: null,
      resultText: "   ",
      error: "empty",
    });
    expect(mode.mode).toBe("unsalvageable");
  });
});

describe("mergeMissingStanceRows", () => {
  it("fills only the missing rows and keeps the partial payload authoritative on duplicates", () => {
    const partial = {
      stances: [stanceRow("issue-001"), stanceRow("issue-002")],
      extra_key: "kept",
    };
    const delta = {
      stances: [
        { ...stanceRow("issue-001"), rationale: "delta must NOT win" },
        stanceRow("issue-021"),
      ],
    };
    const merged = mergeMissingStanceRows(partial, delta);
    const rows = merged.stances as Array<Record<string, unknown>>;
    expect(rows.map((row) => row.issue_id)).toEqual([
      "issue-001",
      "issue-002",
      "issue-021",
    ]);
    expect(rows[0]?.rationale).toBe("lens rationale for issue-001");
    expect(merged.extra_key).toBe("kept");
  });
});

describe("salvage prompts", () => {
  it("transcription prompt carries the invention-guard sentinel and the frozen text", () => {
    const prompt = buildTranscriptionSalvagePrompt({
      resultText: "frozen analysis body",
      error: MISSING_ROWS_ERROR,
    });
    expect(prompt).toContain(SALVAGE_INCOMPLETE_SENTINEL);
    expect(prompt).toContain("frozen analysis body");
    expect(prompt).toContain(MISSING_ROWS_ERROR);
  });

  it("delta prompt embeds the original packet prompt and restricts output to missing rows", () => {
    const prompt = buildDeltaRowsSalvagePrompt({
      boundedPrompt: "ORIGINAL PACKET PROMPT",
      missingIssueIds: ["issue-021", "issue-022"],
    });
    expect(prompt).toContain("ORIGINAL PACKET PROMPT");
    expect(prompt).toContain("issue-021, issue-022");
    expect(prompt).toContain("ONLY the missing row(s)");
  });

  it("derives the frozen-input sidecar path from the seat path", () => {
    expect(salvageInputPathFor("/tmp/s/stance.yaml")).toBe(
      "/tmp/s/stance.yaml.salvage-input.json",
    );
  });
});

describe("salvage write path (same validator as self-submitted payloads)", () => {
  const tempRoots: string[] = [];
  afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  function stanceState(): RuntimeSubmitState {
    return {
      sessionId: "session-001",
      unitId: "issue-stance:logic",
      outputFormat: "issue-stance-response",
      issueStanceSchemaContext: {
        issue_evidence_refs: {
          "issue-001": ["issue-ledger.yaml#issue-001"],
          "issue-021": ["issue-ledger.yaml#issue-021"],
        },
      },
    } as RuntimeSubmitState;
  }

  it("reproduces the measured S2 rejection on the partial payload, then accepts the merged payload", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "salvage-write-"));
    tempRoots.push(tmp);
    const outputPath = path.join(tmp, "logic.yaml");
    const partial = { stances: [stanceRow("issue-001")] };

    await expect(
      writeRuntimeSubmitArtifactFromPayload({
        payload: partial,
        outputPath,
        state: stanceState(),
      }),
    ).rejects.toThrow(/missing issue_id\(s\): issue-021/);

    const merged = mergeMissingStanceRows(partial, {
      stances: [stanceRow("issue-021")],
    });
    await expect(
      writeRuntimeSubmitArtifactFromPayload({
        payload: merged,
        outputPath,
        state: stanceState(),
      }),
    ).resolves.toBeGreaterThan(0);
    const written = await fs.readFile(outputPath, "utf8");
    expect(written).toContain("issue-001");
    expect(written).toContain("issue-021");
  });
});
