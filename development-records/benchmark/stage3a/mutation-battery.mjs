#!/usr/bin/env node
// Mutation battery for stage 3a: each entry breaks ONE property the tests claim to hold.
// A mutation that stays green is either an untested property or a no-op — both worth knowing.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = "/Users/kangmin/Documents/onto-mcp";
const A = `${ROOT}/src/core-runtime/reconstruct/direct-call-directive-author.ts`;
const P = `${ROOT}/src/core-runtime/reconstruct/authoring-prompt-payloads.ts`;

const MUTATIONS = [
  {
    id: "M1 mode flag ignored (always OFF)",
    file: A,
    from: "const observationCatalogTool = args.sourceObservationCatalogTool === true;",
    to: "const observationCatalogTool = false;",
  },
  {
    id: "M2 report the 64 cap even in catalog mode",
    file: A,
    from: `          observation_limit: observationCatalogTool
            ? null
            : ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,`,
    to: "          observation_limit: ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,",
  },
  {
    id: "M3 ladder starts at `full` (detail leaks into the navigation catalog)",
    file: A,
    from: "            levels: OBSERVATION_CATALOG_TOOL_FOLD_LEVELS,\n",
    to: "",
  },
  {
    id: "M4 no pre-dispatch byte guard",
    file: A,
    from: `        assertPromptPayloadByteLimit({
          artifactName: "AnswerSupportLedger",
          systemPrompt: ANSWER_SUPPORT_LEDGER_SYSTEM_PROMPT,
          userPayload: answerSupportUserPayload,
          byteLimit: SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
        });`,
    to: "        void 0;",
  },
  {
    id: "M5 demotion is silent (no disclosure)",
    file: A,
    from: `          sourceBreadthFoldDisclosures.push({
            surface: "maturation_answer_support",
            disclosure: catalogFold.disclosure,
          });`,
    to: "          void 0;",
  },
  {
    id: "M6 disclosure attributed to the wrong surface",
    file: A,
    from: `            surface: "maturation_answer_support",
            disclosure: catalogFold.disclosure,`,
    to: `            surface: "source_admission_selection",
            disclosure: catalogFold.disclosure,`,
  },
  {
    id: "M7 cap still applied in catalog mode",
    file: P,
    from: `  const promptObservationIds = args.observationCatalogTool === true
    ? selectableObservationIds
    : selectableObservationIds.slice(0, ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT);`,
    to: "  const promptObservationIds = selectableObservationIds.slice(0, ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT);",
  },
  {
    id: "M8 OFF policy value drifts (selection_basis reworded)",
    file: A,
    from: '            : "Runtime includes all closure-prioritized source observations in global closure-hint,',
    to: '            : "RUNTIME includes all closure-prioritized source observations in global closure-hint,',
  },
  {
    id: "M9 disclosure emitted even when nothing demoted",
    file: A,
    from: '        if (catalogFold.disclosure.fold_level !== "one_line") {',
    to: "        if (true) {",
  },
  {
    id: "M10 region cap still applied in catalog mode (review F1)",
    file: P,
    from: `  const catalogObservations = args.observationCatalogTool === true
    ? args.sourceObservations.observations
    : capProjectedRegionsPerFile(`,
    to: `  const catalogObservations = false
    ? args.sourceObservations.observations
    : capProjectedRegionsPerFile(`,
  },
  {
    id: "M11 both tail rungs report the same detail loss (review F4)",
    file: `${ROOT}/src/core-runtime/reconstruct/source-breadth-fold.ts`,
    from: '      return "per-observation `location` was dropped where it merely repeated `source_ref`";',
    to: '      return "per-observation summaries were dropped — the catalog carries navigation identity only";',
    tests: ["src/core-runtime/reconstruct/source-breadth-fold.test.ts"],
  },
  {
    id: "M12 ON projection emits N copies of one row (lens B named survivor)",
    file: A,
    from: `        return projectObservationsForPrompt(input.sourceObservations, {
          observationIds: promptObservationIds,
          includeStructuralData: false,
        }) as unknown[];`,
    to: `        const projected = projectObservationsForPrompt(input.sourceObservations, {
          observationIds: promptObservationIds,
          includeStructuralData: false,
        }) as unknown[];
        return projected.map(() => projected[0]);`,
  },
  {
    id: "M13 Core API ignores the settings key (production ON runs as OFF)",
    file: `${ROOT}/src/core-api/reconstruct-api.ts`,
    from: `      const sourceObservationCatalogTool =
        settings.reconstruct?.execution?.source_observation_catalog_tool === true;`,
    to: "      const sourceObservationCatalogTool = false;",
  },
  {
    id: "M14 reuse key hardcodes the mode false (ON artifact keys as OFF)",
    file: `${ROOT}/src/core-runtime/reconstruct/authored-artifact-reuse.ts`,
    from: `    source_observation_catalog_tool:
      args.directiveAuthor.sourceObservationCatalogTool === true,`,
    to: "    source_observation_catalog_tool: false,",
  },
  {
    id: "M15 run.ts hard-codes the demotion wording again",
    file: `${ROOT}/src/core-runtime/reconstruct/run.ts`,
    from: "        message: answerSupportFoldDisclosureMessage(record.disclosure),",
    to: '        message: "Runtime folded the answer-support navigation catalog to a coarser rung.",',
  },
  {
    id: "M16 drain only on success (a failed authoring loses the demotion record)",
    file: `${ROOT}/src/core-runtime/reconstruct/run.ts`,
    from: `  } finally {
    drainAnswerSupportFoldDisclosures();
  }`,
    to: `  }
  drainAnswerSupportFoldDisclosures();`,
  },
  {
    id: "M17 catalog order swapped (prioritized no longer first)",
    file: P,
    from: `  const selectableObservationIds = [
    ...new Set([...prioritizedObservationIds, ...supplementalObservationIds]),
  ];`,
    to: `  const selectableObservationIds = [
    ...new Set([...supplementalObservationIds, ...prioritizedObservationIds]),
  ];`,
  },
  {
    id: "M18 disclosure recorded BEFORE the guard (false event for an undispatched catalog)",
    file: A,
    from: `        if (catalogFold.disclosure.fold_level !== "one_line") {
          sourceBreadthFoldDisclosures.push({
            surface: "maturation_answer_support",
            disclosure: catalogFold.disclosure,
          });
        }
      }`,
    to: `      }`,
    extraFrom: null,
  },
  {
    id: "M19 policy text ignores the dispatched ROWS (fixed field list)",
    file: A,
    from: "              `(${navigationRowFieldsFromRows(projection)}) with no per-observation detail and no slot ` +",
    to: '              "(observation_id, target_material_kind, source_ref, location, summary) with no per-observation detail and no slot " +',
  },
  {
    id: "M20 disclosure sentence hard-coded (ignores the rung's cost)",
    file: `${ROOT}/src/core-runtime/reconstruct/source-breadth-fold.ts`,
    from: "    `${breadthFoldRungDetailLoss(disclosure.fold_level)} ` +",
    to: '    "detail was reduced " +',
    tests: [
      "src/core-runtime/reconstruct/observation-catalog-tool.test.ts",
      "src/core-runtime/reconstruct/source-breadth-fold.test.ts",
    ],
  },
];

const results = [];
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    results.push({ id: m.id, verdict: "ANCHOR-MISS (mutation never applied)" });
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  let verdict;
  try {
    execFileSync(
      "npx",
      ["vitest", "run", ...(m.tests ?? ["src/core-runtime/reconstruct/observation-catalog-tool.test.ts"])],
      { cwd: ROOT, stdio: "pipe" },
    );
    verdict = "UNDETECTED (suite stayed green)";
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const failed = [...out.matchAll(/[×✕]\s(.+?)\n/g)].map((x) => x[1].trim());
    verdict = `detected (${failed.length} failing): ${failed.slice(0, 3).join(" | ")}`;
  }
  writeFileSync(m.file, original);
  results.push({ id: m.id, verdict });
  console.log(`${m.id} -> ${verdict}`);
}
console.log("\n=== SUMMARY ===");
for (const r of results) console.log(`${r.verdict.startsWith("detected") ? "OK " : "!! "} ${r.id} :: ${r.verdict}`);
