import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLedgerTrust,
  buildOutputHashes,
  firstUntrustedRequiredUnit,
  isTrustedLedgerUnit,
  type PipelineExecutionLedger,
  type PipelineExecutionLedgerUnitEntry,
} from "./pipeline-execution-ledger.js";

const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-pipeline-execution-ledger-"),
  );
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

function unit(
  overrides: Partial<PipelineExecutionLedgerUnitEntry> = {},
): PipelineExecutionLedgerUnitEntry {
  return {
    unitId: "unit:a",
    unitKind: "test",
    owner: "runtime",
    producedArtifactRefs: [],
    consumedArtifactRefs: [],
    outputRefs: [],
    outputHashes: {},
    status: "planned",
    trustStatus: "untrusted",
    trustReason: "planned",
    attemptCount: 0,
    lastFailureMessage: null,
    upstreamUnitIds: [],
    downstreamUnitIds: [],
    ...overrides,
  };
}

describe("PipelineExecutionLedger helpers", () => {
  it("hashes present outputs and marks absent outputs as null", async () => {
    const root = await tempRoot();
    const present = path.join(root, "present.txt");
    const absent = path.join(root, "absent.txt");
    await fs.writeFile(present, "ledger trust\n", "utf8");

    const hashes = await buildOutputHashes([present, absent]);

    expect(hashes[present]).toMatch(/^[a-f0-9]{64}$/);
    expect(hashes[absent]).toBeNull();
  });

  it("requires completed status, trusted status, and present outputs", () => {
    const trusted = unit({
      outputRefs: ["out.md"],
      outputHashes: { "out.md": "abc" },
      status: "completed",
      trustStatus: "trusted",
    });

    expect(isTrustedLedgerUnit(trusted)).toBe(true);
    expect(isTrustedLedgerUnit({ ...trusted, outputHashes: { "out.md": null } }))
      .toBe(false);
    expect(isTrustedLedgerUnit({ ...trusted, trustStatus: "untrusted" }))
      .toBe(false);
  });

  it("derives blocked trust when upstream trust is absent", () => {
    expect(
      buildLedgerTrust({
        status: "completed",
        outputRefs: [],
        outputHashes: {},
        upstreamTrusted: false,
      }),
    ).toEqual({
      trustStatus: "blocked_by_upstream",
      trustReason: "A required upstream unit is not trusted.",
    });
  });

  it("finds the first non-trusted unit in ledger order", () => {
    const ledger: PipelineExecutionLedger = {
      schemaVersion: "1",
      pipeline: "review",
      sessionId: "s1",
      sourceRefs: [],
      units: [
        unit({
          unitId: "trusted",
          outputRefs: ["a"],
          outputHashes: { a: "abc" },
          status: "completed",
          trustStatus: "trusted",
        }),
        unit({ unitId: "failed", status: "failed" }),
      ],
    };

    expect(firstUntrustedRequiredUnit(ledger)?.unitId).toBe("failed");
  });
});
