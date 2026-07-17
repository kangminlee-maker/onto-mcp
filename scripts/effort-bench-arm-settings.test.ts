import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildArmFiles,
  generateArmSettings,
  verifyConfoundDiff,
  type ArmSpec,
} from "./effort-bench-arm-settings.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_PATH = path.join(
  here,
  "..",
  "development-records",
  "benchmark",
  "m3",
  "p2-eval-settings",
  "settings-eval-gpt-5.6-sol.json",
);

const loadBase = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(BASE_PATH, "utf8")) as Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

describe("generateArmSettings — real committed base (settings-eval-gpt-5.6-sol.json)", () => {
  const spec: ArmSpec = { zone: "partial", maxEmbedLines: 80, effort: "high" };

  it("sets the embed-lines knob", async () => {
    const base = await loadBase();
    const arm = generateArmSettings(base, spec);
    expect(((arm as Any).review.context.max_embed_lines)).toBe(80);
  });

  it("sets effort=high on every review unit LLM seat", async () => {
    const base = await loadBase();
    const arm = generateArmSettings(base, spec);
    const baseUnits = (base as Any).review.execution.units as Record<string, Any>;
    const armUnits = (arm as Any).review.execution.units as Record<string, Any>;
    const llmUnitNames = Object.keys(baseUnits).filter((name) => baseUnits[name].llm !== undefined);
    expect(llmUnitNames.length).toBeGreaterThan(0);
    for (const name of llmUnitNames) {
      expect(armUnits[name].llm.effort).toBe("high");
    }
  });

  it("sets effort=high on all three actors", async () => {
    const base = await loadBase();
    const arm = generateArmSettings(base, spec);
    const baseActors = (base as Any).review.execution.actors as Record<string, Any>;
    const armActors = (arm as Any).review.execution.actors as Record<string, Any>;
    const actorNames = Object.keys(baseActors);
    expect(actorNames.length).toBe(3);
    for (const name of actorNames) {
      expect(armActors[name].llm.effort).toBe("high");
    }
  });

  it("leaves reconstruct deep-equal to base", async () => {
    const base = await loadBase();
    const arm = generateArmSettings(base, spec);
    expect((arm as Any).reconstruct).toEqual((base as Any).reconstruct);
  });

  it("leaves review.execution.units.issue_stance_matrix untouched (no llm key — skipped, not an error)", async () => {
    const base = await loadBase();
    const arm = generateArmSettings(base, spec);
    const baseUnit = (base as Any).review.execution.units.issue_stance_matrix;
    const armUnit = (arm as Any).review.execution.units.issue_stance_matrix;
    expect(baseUnit.llm).toBeUndefined();
    expect(armUnit).toEqual(baseUnit);
  });

  it("does not mutate the base object", async () => {
    const base = await loadBase();
    const before = JSON.parse(JSON.stringify(base));
    generateArmSettings(base, spec);
    expect(base).toEqual(before);
  });

  it("is deterministic across two generations (deep-equal, byte-shape stable)", async () => {
    const base = await loadBase();
    const a = generateArmSettings(base, spec);
    const b = generateArmSettings(base, spec);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("verifyConfoundDiff — passes on generator output", () => {
  it("passes on the generator's own output", async () => {
    const base = await loadBase();
    const spec: ArmSpec = { zone: "partial", maxEmbedLines: 80, effort: "high" };
    const settings = generateArmSettings(base, spec);
    expect(() => verifyConfoundDiff(base, [{ spec, settings }])).not.toThrow();
  });

  it("passes on a full batch of arms (all zones × efforts)", async () => {
    const base = await loadBase();
    const specs: ArmSpec[] = [
      { zone: "full", maxEmbedLines: 300, effort: "medium" },
      { zone: "full", maxEmbedLines: 300, effort: "high" },
      { zone: "partial", maxEmbedLines: 80, effort: "medium" },
      { zone: "partial", maxEmbedLines: 80, effort: "high" },
      { zone: "low", maxEmbedLines: 40, effort: "medium" },
      { zone: "low", maxEmbedLines: 40, effort: "high" },
    ];
    const arms = specs.map((spec) => ({ spec, settings: generateArmSettings(base, spec) }));
    expect(() => verifyConfoundDiff(base, arms)).not.toThrow();
  });
});

describe("verifyConfoundDiff — fails (throws, message names the path) on a tampered arm", () => {
  const spec: ArmSpec = { zone: "partial", maxEmbedLines: 80, effort: "high" };

  it("(a) rejects an off-axis edit (changed review.context.max_listing_depth)", async () => {
    const base = await loadBase();
    const settings = generateArmSettings(base, spec);
    (settings as Any).review.context.max_listing_depth = 999;
    expect(() => verifyConfoundDiff(base, [{ spec, settings }])).toThrow(
      /review\/context\/max_listing_depth/,
    );
  });

  it("(b) rejects a removed key (review.artifacts.write_lens_markdown deleted)", async () => {
    const base = await loadBase();
    const settings = generateArmSettings(base, spec);
    delete (settings as Any).review.artifacts.write_lens_markdown;
    expect(() => verifyConfoundDiff(base, [{ spec, settings }])).toThrow(
      /review\/artifacts\/write_lens_markdown/,
    );
  });

  it("(c) rejects an intended path holding the wrong value (one actor's effort left at base value)", async () => {
    const base = await loadBase();
    const settings = generateArmSettings(base, spec);
    (settings as Any).review.execution.actors.synthesize.llm.effort = "medium";
    expect(() => verifyConfoundDiff(base, [{ spec, settings }])).toThrow(
      /review\/execution\/actors\/synthesize\/llm\/effort/,
    );
  });

  it("(c) rejects a wrong max_embed_lines value", async () => {
    const base = await loadBase();
    const settings = generateArmSettings(base, spec);
    (settings as Any).review.context.max_embed_lines = 999;
    expect(() => verifyConfoundDiff(base, [{ spec, settings }])).toThrow(
      /review\/context\/max_embed_lines/,
    );
  });
});

describe("generateArmSettings — fail-loud cases", () => {
  it("rejects a base without review.context", async () => {
    const base = await loadBase();
    delete (base as Any).review.context;
    expect(() => generateArmSettings(base, { zone: "z", maxEmbedLines: 10, effort: "high" })).toThrow(
      /review\.context must be an object/,
    );
  });

  it("rejects a base with zero llm sites", () => {
    const base = { review: { context: {}, execution: { units: {}, actors: {} } } };
    expect(() => generateArmSettings(base, { zone: "z", maxEmbedLines: 10, effort: "high" })).toThrow(
      /no review LLM seats/,
    );
  });

  it("rejects a non-positive maxEmbedLines", async () => {
    const base = await loadBase();
    expect(() => generateArmSettings(base, { zone: "z", maxEmbedLines: 0, effort: "high" })).toThrow(
      /maxEmbedLines/,
    );
    expect(() => generateArmSettings(base, { zone: "z", maxEmbedLines: -5, effort: "high" })).toThrow(
      /maxEmbedLines/,
    );
    expect(() => generateArmSettings(base, { zone: "z", maxEmbedLines: 1.5, effort: "high" })).toThrow(
      /maxEmbedLines/,
    );
  });

  it("rejects an empty zone or effort string", async () => {
    const base = await loadBase();
    expect(() => generateArmSettings(base, { zone: "", maxEmbedLines: 10, effort: "high" })).toThrow(
      /spec\.zone/,
    );
    expect(() => generateArmSettings(base, { zone: "z", maxEmbedLines: 10, effort: "" })).toThrow(
      /spec\.effort/,
    );
  });
});

describe("buildArmFiles", () => {
  const zones = [
    { name: "full", maxEmbedLines: 300 },
    { name: "partial", maxEmbedLines: 80 },
    { name: "low", maxEmbedLines: 40 },
  ];
  const efforts = ["medium", "high"];

  it("produces the right filenames + count for 3 zones × 2 efforts", async () => {
    const base = await loadBase();
    const files = buildArmFiles(base, zones, efforts);
    expect(files.length).toBe(6);
    const names = files.map((f) => f.filename).sort();
    expect(names).toEqual(
      [
        "settings-full-high.json",
        "settings-full-medium.json",
        "settings-low-high.json",
        "settings-low-medium.json",
        "settings-partial-high.json",
        "settings-partial-medium.json",
      ].sort(),
    );
  });

  it("each produced file individually passes verifyConfoundDiff", async () => {
    const base = await loadBase();
    const files = buildArmFiles(base, zones, efforts);
    for (const file of files) {
      const [, zone, effortWithExt] = file.filename.match(/^settings-(.+)-(.+)\.json$/) ?? [];
      const effort = effortWithExt;
      const zoneSpec = zones.find((z) => z.name === zone)!;
      const spec: ArmSpec = { zone: zone!, maxEmbedLines: zoneSpec.maxEmbedLines, effort: effort! };
      expect(() => verifyConfoundDiff(base, [{ spec, settings: file.settings }])).not.toThrow();
    }
  });

  it("rejects a duplicate zone name", async () => {
    const base = await loadBase();
    expect(() =>
      buildArmFiles(
        base,
        [
          { name: "full", maxEmbedLines: 300 },
          { name: "full", maxEmbedLines: 80 },
        ],
        ["medium"],
      ),
    ).toThrow(/duplicate zone name/);
  });

  it("rejects an empty zones or efforts list", async () => {
    const base = await loadBase();
    expect(() => buildArmFiles(base, [], efforts)).toThrow(/zones must be a non-empty list/);
    expect(() => buildArmFiles(base, zones, [])).toThrow(/efforts must be a non-empty list/);
  });
});
