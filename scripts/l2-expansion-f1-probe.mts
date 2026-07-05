/**
 * Backlog-① F1 verification probe: replay the REAL expansion payload (captured seq 1802)
 * against the F1-amended ONTOLOGY_EXPANSION_SYSTEM_PROMPT and prove, via the REAL
 * validateOntologyExpansion, that authored target refs are element ids (no
 * seed_authority_rewrite_attempt). Controls:
 *   - control_original: the run's captured LLM output fed through the SAME projection +
 *     validator must yield exactly the 5 seed_authority_rewrite_attempt violations
 *     (proves this probe's validator leg can fail — non-vacuous green).
 *   - fixed ×3 reps: fresh codex/gpt-5.5 medium calls (production parity) with the
 *     amended prompt; each must validate with zero violations.
 * Projection mirrors run.ts writeOntologyExpansion: evidence_refs are resolved from the
 * cited answer claims' supporting_evidence_refs (the vocabulary the validator checks).
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { validateOntologyExpansion } from "../src/core-runtime/reconstruct/maturation-validation.ts";

const B = "/private/tmp/claude-501/-Users-kangmin-cowork-onto-mcp-claude/231ba654-0847-47df-b1b0-24e591fda741/scratchpad/expfix";
const RUN = ".onto/reconstruct/l2-real-llm-2026-07-03T01-41-57-3392b185";
const payload = fs.readFileSync(`${B}/user-payload.json`, "utf8");
const fixedPrompt = fs.readFileSync(`${B}/system-prompt-fixed.txt`, "utf8");

const claims = parseYaml(fs.readFileSync(`${RUN}/maturation-answer-claims.yaml`, "utf8"));
const claimsValidation = parseYaml(fs.readFileSync(`${RUN}/maturation-answer-claims-validation.yaml`, "utf8"));
const claimById = new Map<string, any>(claims.answer_claims.map((c: any) => [c.answer_claim_id, c]));
const sessionId = claims.session_id;

function project(llmJson: any): any {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: new Date().toISOString(),
    answer_claims_ref: `${RUN}/maturation-answer-claims.yaml`,
    source_seed_ref: `${RUN}/ontology-seed.yaml`,
    expansions: (llmJson.expansions ?? []).map((e: any, i: number) => {
      const evidence: any[] = [];
      const seen = new Set<string>();
      for (const ref of e.answer_claim_refs ?? []) {
        const claim = claimById.get(ref);
        for (const ev of claim?.supporting_evidence_refs ?? []) {
          const k = JSON.stringify(ev);
          if (!seen.has(k)) { seen.add(k); evidence.push(ev); }
        }
      }
      return {
        expansion_id: e.expansion_id ?? `ontology-expansion-${i + 1}`,
        operation: e.operation,
        target_surface_refs: e.target_surface_refs ?? [],
        target_dimension_refs: e.target_dimension_refs ?? [],
        target_seed_or_ontology_refs: e.target_seed_or_ontology_refs ?? [],
        purpose_element_refs: e.purpose_element_refs ?? [],
        answer_claim_refs: e.answer_claim_refs ?? [],
        evidence_refs: evidence,
        concept_economy_effect: e.concept_economy_effect,
        rationale: e.rationale ?? "",
        limitation_refs: e.limitation_refs ?? [],
      };
    }),
    directive_author: { owner: "host_llm", author_id: "f1-probe" },
  };
}

function validate(label: string, llmJson: any): { violations: any[]; targets: string[][] } {
  const artifact = project(llmJson);
  const v = validateOntologyExpansion({
    ontologyExpansion: artifact,
    ontologyExpansionRef: `${RUN}/ontology-expansion.yaml`,
    maturationAnswerClaims: claims,
    maturationAnswerClaimsValidation: claimsValidation,
    maturationAnswerClaimsValidationRef: `${RUN}/maturation-answer-claims-validation.yaml`,
  });
  const targets = artifact.expansions.map((e: any) => e.target_seed_or_ontology_refs);
  console.log(`[${label}] status=${v.validation_status} violations=${v.violations.length} ops=${JSON.stringify(v.operation_counts)}`);
  for (const viol of v.violations) console.log(`  - ${viol.code}: ${viol.subject_id ?? viol.subjectId ?? ""}`);
  return { violations: v.violations, targets };
}

// ── control: original captured output must FAIL with exactly 5 seed_authority_rewrite_attempt
const original = JSON.parse(fs.readFileSync(`${B}/original-output.json`, "utf8"));
const ctrl = validate("control_original", original);
const rewriteCount = ctrl.violations.filter((v: any) => v.code === "seed_authority_rewrite_attempt").length;
if (rewriteCount !== 5) throw new Error(`probe control broken: expected 5 seed_authority_rewrite_attempt, got ${rewriteCount}`);
console.log("control OK: probe validator leg reproduces the 5 violations (falsifiable)\n");

// ── fixed replay ×3
let allPass = true;
for (let rep = 1; rep <= 3; rep += 1) {
  const r = spawnSync("codex", ["exec", "--skip-git-repo-check", "--ephemeral", "-m", "gpt-5.5",
    "-c", 'model_reasoning_effort="medium"', "-c", 'service_tier="fast"', "-"],
    { input: `${fixedPrompt}\n\n---\n\n${payload}`, encoding: "utf8", timeout: 600_000 });
  if (r.status !== 0) throw new Error(`codex call failed (rep ${rep}): ${r.stderr?.slice(0, 300)}`);
  const text = r.stdout.trim();
  fs.writeFileSync(`${B}/fixed-output-rep${rep}.json`, text);
  const out = JSON.parse(text);
  const res = validate(`fixed_rep${rep}`, out);
  console.log(`  targets: ${JSON.stringify(res.targets)}`);
  const seedPath = res.targets.flat().filter((t: string) => t.includes("ontology-seed.yaml"));
  if (res.violations.length > 0 || seedPath.length > 0) allPass = false;
  console.log();
}
console.log(allPass ? "VERDICT: F1 PASS — 3/3 reps validate clean, no seed-path targets" : "VERDICT: F1 FAIL");
process.exit(allPass ? 0 : 1);
