/**
 * Drift guard for the generated Linguist catalog: regenerate in memory from the vendored
 * `languages.yml` and byte-compare against the committed
 * `src/core-runtime/linguist-language-catalog.generated.ts`. A mismatch means the catalog was
 * hand-edited or the vendored data changed without regeneration — fail loud.
 *
 * npm: `check:linguist-drift`. Fix: `npm run generate:linguist`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateFromVendor } from "./generate-linguist-tables.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function main(): void {
  const { source, outPath } = generateFromVendor();
  const committed = readFileSync(outPath, "utf8");
  if (committed !== source) {
    console.error(
      `Linguist catalog drift: ${path.relative(PROJECT_ROOT, outPath)} does not match a fresh ` +
        `regeneration from vendor/linguist/languages.yml.\nRun \`npm run generate:linguist\` and commit.`,
    );
    process.exit(1);
  }
  console.log("linguist catalog: no drift (committed catalog matches regeneration)");
}

main();
