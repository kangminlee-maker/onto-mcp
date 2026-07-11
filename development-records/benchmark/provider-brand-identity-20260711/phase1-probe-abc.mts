/**
 * Phase 1 probe [A][B][C] — post-fix expectations (provider-brand-identity-class
 * design 2026-07-11 §3-1). Offline: resolveB4LiveSeats makes no LLM calls.
 *
 * [A] openai/gpt-5.6-luna candidate ADMITTED with identity `openai/gpt-5.6-luna`
 *     (pre-fix this was `codex/gpt-5.6-luna` — the expectation swap IS the
 *     regression pin for the brand fix).
 * [B] anthropic/claude-sonnet-5 candidate unchanged: `anthropic/claude-sonnet-5`.
 * [C] empty model still REJECTED (guard alive, negative control).
 *
 * Writes [A]'s actual identity to phase1-identity-A.txt for probe [D] to
 * consume (no hardcoded literal in [D]).
 */
import fs from "node:fs/promises";
import { resolveB4LiveSeats } from "/Users/kangmin/Documents/onto-mcp/scripts/b4-live-realization.mjs";

const repoRoot = "/Users/kangmin/Documents/onto-mcp";
const baseline = { provider: "openai", model: "gpt-5.5" } as const;

async function attempt(label: string, candidate: Record<string, unknown>) {
  try {
    const seats = await resolveB4LiveSeats({ repoRoot, candidate: candidate as never, baseline });
    console.log(`[${label}] ADMITTED → candidateModelIdentity=${seats.candidateModelIdentity}`);
    return { admitted: true, identity: seats.candidateModelIdentity };
  } catch (error) {
    console.log(`[${label}] REJECTED → ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    return { admitted: false, identity: null };
  }
}

const a = await attempt("A openai/luna     ", { provider: "openai", model: "gpt-5.6-luna", reasoning_effort: "low" });
const b = await attempt("B anthropic/sonnet", { provider: "anthropic", model: "claude-sonnet-5", thinking_mode: "disabled" });
const c = await attempt("C empty model     ", { provider: "openai", model: "" });

const problems: string[] = [];
if (!a.admitted) problems.push("[A] luna candidate should be ADMITTED");
if (a.identity !== "openai/gpt-5.6-luna") problems.push(`[A] identity must be DECLARED brand openai/gpt-5.6-luna, got ${a.identity}`);
if (!b.admitted) problems.push("[B] sonnet-5 candidate regressed");
if (b.identity !== "anthropic/claude-sonnet-5") problems.push(`[B] identity must be anthropic/claude-sonnet-5, got ${b.identity}`);
if (c.admitted) problems.push("[C] empty-model candidate was ADMITTED — guard dead");

if (a.identity) {
  await fs.writeFile(
    "/private/tmp/claude-501/-Users-kangmin-Documents-onto-mcp/3ef1e5cf-ce5f-4331-b4a0-6ca400e156e7/scratchpad/phase1-identity-A.txt",
    a.identity,
  );
}

console.log(`\n[verdict] ${problems.length === 0 ? "PASS — declared-brand identity, sonnet parity, guard alive" : "FAIL:\n  - " + problems.join("\n  - ")}`);
if (problems.length > 0) process.exit(1);
