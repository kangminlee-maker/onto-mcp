/**
 * Phase 1 probe [L2] — I-2 fix offline assertion (design §3-2). Settings
 * resolution is a pure projection; no live run needed.
 *
 * Contrast pair over the REAL settings chain (same inputs l2-real-llm-run uses):
 *  - OLD expression (resolved config source): must yield `codex/gpt-5.5`
 *    (proves the latent bug was real, not hypothetical)
 *  - NEW expression (declared seat source):  must yield `openai/gpt-5.5`
 *    (the registry brand — what the fixed l2 script now writes)
 */
import {
  resolveSettingsChain,
  resolveReconstructActorLlmSettings,
} from "/Users/kangmin/Documents/onto-mcp/src/core-runtime/discovery/settings-chain.js";
import { resolveLlmProviderConfig } from "/Users/kangmin/Documents/onto-mcp/src/core-runtime/llm/llm-caller.js";

const REPO = "/Users/kangmin/Documents/onto-mcp";
const settings = await resolveSettingsChain(REPO, REPO);
const authorLlm = resolveReconstructActorLlmSettings(settings, "semantic_author");
const authorLlmConfig = resolveLlmProviderConfig({ config: { llm: authorLlm } }) as Record<string, unknown>;

const oldExpr = `${String(authorLlmConfig.provider ?? "?")}/${String(authorLlmConfig.model_id ?? (authorLlmConfig as { model?: string }).model ?? "?")}`;
const newExpr = `${String((authorLlm as { provider?: string }).provider ?? "?")}/${String((authorLlm as { model?: string }).model ?? "?")}`;

console.log(`[old resolved-config expression] ${oldExpr}`);
console.log(`[new declared-seat expression]   ${newExpr}`);

const problems: string[] = [];
if (oldExpr !== "codex/gpt-5.5") problems.push(`old expression expected codex/gpt-5.5 (latent bug evidence), got ${oldExpr}`);
if (newExpr !== "openai/gpt-5.5") problems.push(`new expression expected registry brand openai/gpt-5.5, got ${newExpr}`);

console.log(`\n[verdict] ${problems.length === 0 ? "PASS — old form leaked codex, new form carries the registry brand" : "FAIL:\n  - " + problems.join("\n  - ")}`);
if (problems.length > 0) process.exit(1);
