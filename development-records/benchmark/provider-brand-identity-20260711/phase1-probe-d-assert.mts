/**
 * Phase 1 probe [D] assertions — real-consumer-path replay (design §3-1 [D]).
 *
 * Three mock-rejudge rehearsals already ran through the REAL b4-rejudge script
 * (readPreflightSeats → record assembly → validateSynthesizeCertRecord):
 *  - d-run-control: untouched sonnet-5 runDir → provider anthropic (rehearsal
 *    itself works — non-vacuous baseline)
 *  - d-run-new: candidate seat = probe [A]'s ACTUAL resolveB4LiveSeats output
 *    (openai/gpt-5.6-luna) → record must carry the registry brand
 *  - d-run-old: candidate seat = pre-fix codex form → record carries "codex";
 *    the REAL B5 binding (synthesizeCertBindingViolations) must FIRE against a
 *    luna registry entry — proving the check discriminates (the exact bug).
 */
import fs from "node:fs/promises";
import { synthesizeCertBindingViolations } from "/Users/kangmin/Documents/onto-mcp/src/core-runtime/discovery/synthesize-cert-record.js";

const SCRATCH = "/private/tmp/claude-501/-Users-kangmin-Documents-onto-mcp/3ef1e5cf-ce5f-4331-b4a0-6ca400e156e7/scratchpad";
const identityA = (await fs.readFile(`${SCRATCH}/phase1-identity-A.txt`, "utf8")).trim();
const [brandA, modelA] = [identityA.slice(0, identityA.indexOf("/")), identityA.slice(identityA.indexOf("/") + 1)];

async function record(variant: string) {
  return JSON.parse(await fs.readFile(`${SCRATCH}/d-run-${variant}/local/rejudge-mock-record.json`, "utf8"));
}
function cells(r: Record<string, never>) {
  const rec = r as { provider: string; model: string; arm_model: Record<string, { provider: string; model: string }> };
  return {
    top: `${rec.provider}/${rec.model}`,
    candidate: `${rec.arm_model.candidate.provider}/${rec.arm_model.candidate.model}`,
    negative: `${rec.arm_model.negative_control.provider}/${rec.arm_model.negative_control.model}`,
  };
}

const problems: string[] = [];
const ctl = cells(await record("control"));
console.log(`[control] top=${ctl.top} candidate=${ctl.candidate} negative=${ctl.negative}`);
if (ctl.top !== "anthropic/claude-sonnet-5") problems.push(`[control] expected anthropic/claude-sonnet-5, got ${ctl.top} — rehearsal baseline broken`);

const neu = cells(await record("new"));
console.log(`[new]     top=${neu.top} candidate=${neu.candidate} negative=${neu.negative}`);
for (const [k, v] of Object.entries(neu)) {
  if (v !== identityA) problems.push(`[new] ${k} expected ${identityA}, got ${v}`);
}

const old = cells(await record("old"));
console.log(`[old]     top=${old.top} candidate=${old.candidate} negative=${old.negative}`);
if (old.top !== `codex/${modelA}`) problems.push(`[old] expected codex/${modelA} (pre-fix leak), got ${old.top}`);

// REAL B5 binding: a hypothetical luna registry entry citing each record.
const supportedModelKeys = new Set([`${brandA}/${modelA}`, "openai/gpt-5.5"]);
async function binding(variant: string) {
  const ref = `d-run-${variant}/local/rejudge-mock-record.json`;
  const entry = {
    provider: brandA,
    model: modelA,
    verified_at: "2026-07-11",
    roles: ["semantic_map_synthesize"],
    benchmark_evidence_refs: [ref],
  };
  const evidenceByRef = new Map([[ref, await record(variant) as unknown]]);
  return synthesizeCertBindingViolations({ entry: entry as never, evidenceByRef, supportedModelKeys });
}
const vNew = await binding("new");
const vOld = await binding("old");
console.log(`[B5 new] violations=${vNew.length} ${JSON.stringify(vNew.map((v: { code: string }) => v.code))}`);
console.log(`[B5 old] violations=${vOld.length} ${JSON.stringify(vOld.map((v: { code: string }) => v.code))}`);
if (vNew.length !== 0) problems.push(`[B5 new] post-fix record must bind cleanly to the ${brandA}/${modelA} entry; got ${JSON.stringify(vNew)}`);
if (vOld.length === 0) problems.push("[B5 old] pre-fix codex record bound cleanly — binding does NOT discriminate (probe vacuous)");

console.log(`\n[verdict] ${problems.length === 0 ? "PASS — real consumer path carries the declared brand; B5 binding admits new and rejects old" : "FAIL:\n  - " + problems.join("\n  - ")}`);
if (problems.length > 0) process.exit(1);
