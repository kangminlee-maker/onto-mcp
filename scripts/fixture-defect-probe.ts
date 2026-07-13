import { transformSync } from "esbuild";

/**
 * V1 fixture-defect probe harness (review-cert/v3 design §D5). A fixture's
 * review target is a TS-syntax SOURCE BLOB (scripts/review-pipeline-benchmark.ts
 * benchmarkFixture), never a real module on disk — writing the seeded defect as
 * a real module would violate the benchmark's single-source-of-truth invariant.
 * To PROVE a seeded defect is real (not merely asserted in a comment), transpile
 * the self-contained blob and import it in isolation, then execute the defective
 * export. esbuild strips the TS types; a base64 data: URL dynamic import yields a
 * fresh, isolated module graph — no disk write, no shared state between probes.
 *
 * The code fixtures' target blobs are self-contained (no cross-file imports);
 * pass the single target file's source. A blob that imports another file is out
 * of scope for this probe.
 */
export async function transpileEvalModule(
  tsSource: string,
): Promise<Record<string, unknown>> {
  const { code } = transformSync(tsSource, { loader: "ts", format: "esm" });
  const dataUrl =
    "data:text/javascript;base64," +
    Buffer.from(code, "utf8").toString("base64");
  return (await import(dataUrl)) as Record<string, unknown>;
}
