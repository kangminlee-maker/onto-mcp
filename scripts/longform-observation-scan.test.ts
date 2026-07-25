import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { collectSession, scanSession, updateLedger } from "./longform-observation-scan.ts";

const PREP = "execution-preparation";

async function makeSession(
  root: string,
  id: string,
  opts: {
    renderedLines: number;
    witness?: { effective: number; source: string };
    refFile?: { name: string; content: string };
  },
): Promise<string> {
  const dir = path.join(root, id);
  const prep = path.join(dir, PREP);
  await fs.mkdir(prep, { recursive: true });

  const refPath = opts.refFile ? path.join(root, opts.refFile.name) : path.join(root, "ghost.md");
  if (opts.refFile) await fs.writeFile(refPath, opts.refFile.content, "utf8");

  // kind line + ref header (3 lines) + body — matches the renderer's shape.
  const bodyLines = Array.from({ length: opts.renderedLines - 3 }, (_, i) => `body line ${i + 1}`);
  const rendered = [`kind: single_text`, `## ${path.basename(refPath)}`, `ref: ${refPath}`, ...bodyLines].join("\n");
  await fs.writeFile(path.join(prep, "materialized-input.md"), rendered, "utf8");

  const manifest: Record<string, unknown> = { session_id: id, target_refs: [refPath] };
  if (opts.witness) {
    manifest.embed_budget = {
      max_embed_lines_effective: opts.witness.effective,
      max_embed_lines_source: opts.witness.source,
    };
  }
  await fs.writeFile(path.join(prep, "review-context-manifest.yaml"), YAML.stringify(manifest), "utf8");
  await fs.writeFile(
    path.join(prep, "review-target-profile.yaml"),
    YAML.stringify({ requested_target: opts.refFile?.name ?? "ghost.md", target_material_kind: "document" }),
    "utf8",
  );
  return dir;
}

describe("scanSession", () => {
  it("detects a witnessed session whose render exceeds its effective budget", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "longform-"));
    const dir = await makeSession(root, "s-long", {
      renderedLines: 320,
      witness: { effective: 300, source: "default" },
      refFile: { name: "target.md", content: "content\n" },
    });
    const d = await scanSession(dir);
    expect(d).not.toBeNull();
    expect(d!.rendered_lines).toBe(320);
    expect(d!.max_embed_lines_effective).toBe(300);
    expect(d!.effective_source).toBe("default");
    expect(d!.over_by).toBe(20);
    expect(d!.target_refs).toHaveLength(1);
  });

  it("returns null at the exact boundary (rendered == effective → no cut fires)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "longform-"));
    const dir = await makeSession(root, "s-boundary", {
      renderedLines: 300,
      witness: { effective: 300, source: "default" },
    });
    expect(await scanSession(dir)).toBeNull();
  });

  it("returns null for a short session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "longform-"));
    const dir = await makeSession(root, "s-short", {
      renderedLines: 154,
      witness: { effective: 300, source: "default" },
    });
    expect(await scanSession(dir)).toBeNull();
  });

  it("falls back to the assumed default for pre-witness sessions and flags it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "longform-"));
    const dir = await makeSession(root, "s-prewitness", { renderedLines: 400 });
    const d = await scanSession(dir);
    expect(d).not.toBeNull();
    expect(d!.max_embed_lines_effective).toBe(300);
    expect(d!.effective_source).toBe("assumed_default");
  });

  it("returns null when no render was persisted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "longform-"));
    const dir = path.join(root, "s-empty");
    await fs.mkdir(dir, { recursive: true });
    expect(await scanSession(dir)).toBeNull();
  });
});

describe("collectSession + updateLedger", () => {
  it("preserves the prep trio, snapshots existing refs, and stays idempotent by session_id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "longform-"));
    const out = path.join(root, "out");
    const dir = await makeSession(root, "s-collect", {
      renderedLines: 350,
      witness: { effective: 300, source: "cli" },
      refFile: { name: "real-target.md", content: "the real target body\n" },
    });
    const d = (await scanSession(dir))!;
    const row = await collectSession(d, out, () => "2026-07-18T00:00:00.000Z");

    const copiedRender = await fs.readFile(path.join(out, "s-collect", PREP, "materialized-input.md"), "utf8");
    expect(copiedRender.trim().split("\n").length).toBe(350);
    expect(row.refs[0]!.status).toBe("snapshotted");
    const snapshot = await fs.readFile(path.join(out, "s-collect", row.refs[0]!.snapshot!), "utf8");
    expect(snapshot).toBe("the real target body\n");
    const observation = YAML.parse(await fs.readFile(path.join(out, "s-collect", "observation.yaml"), "utf8"));
    expect(observation.session_id).toBe("s-collect");
    expect(observation.rendered_lines).toBe(350);

    const first = await updateLedger(out, [row]);
    expect(first).toEqual({ appended: 1, skipped: 0 });
    const second = await updateLedger(out, [row]);
    expect(second).toEqual({ appended: 0, skipped: 1 });
    const ledger = YAML.parse(await fs.readFile(path.join(out, "ledger.yaml"), "utf8"));
    expect(ledger.observations).toHaveLength(1);
  });

  it("records a missing ref honestly instead of failing the collection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "longform-"));
    const out = path.join(root, "out");
    const dir = await makeSession(root, "s-missing-ref", {
      renderedLines: 350,
      witness: { effective: 300, source: "plan" },
    });
    const d = (await scanSession(dir))!;
    const row = await collectSession(d, out, () => "2026-07-18T00:00:00.000Z");
    expect(row.refs[0]!.status).toBe("missing_at_scan");
    expect(row.refs[0]!.sha256).toBeNull();
  });
});
