/**
 * Inline context embedder — Phase 2 of host runtime decoupling.
 *
 * Expands ref-only artifact references in a prompt packet into inline
 * content blocks. Used by `inline-http-review-unit-executor.ts` when the
 * executor has no tool ecosystem (LLM cannot read files on its own).
 *
 * # What gets embedded
 *
 * Phase 2 scope: domain documents only. The packet typically references:
 * - `~/.onto/domains/{domain}/{file}.md`
 *
 * Materialized input (target content) is already inlined in the packet
 * itself by `materialize-review-prompt-packets.ts` — no re-processing.
 *
 * # Strategy
 *
 * The packet is markdown with sections like:
 * ```
 * ## Domain Documents
 * - Primary: ~/.onto/domains/software-engineering/logic_rules.md
 * - Supplementary: ~/.onto/domains/software-engineering/concepts.md
 * ```
 *
 * After embedding:
 * ```
 * ## Domain Documents (inline-embedded)
 * - Primary: ~/.onto/domains/software-engineering/logic_rules.md
 *
 *   <details><summary>Inline content (logic_rules.md)</summary>
 *
 *   {file content}
 *
 *   </details>
 *
 * - Supplementary: ~/.onto/domains/software-engineering/concepts.md
 *
 *   <details><summary>Inline content (concepts.md)</summary>
 *   ...
 * ```
 *
 * The `<details>` wrapping keeps the prompt visually scannable; LLMs treat
 * the text as ordinary content (collapsing is a renderer feature, not a
 * content directive).
 *
 * # Size limits
 *
 * Each embedded file is truncated to MAX_EMBED_LINES (default 500) to
 * prevent runaway prompt size. Truncation marker is added at the cut point.
 *
 * # Failure modes
 *
 * - Missing referenced file: throws before dispatch so direct-call review does
 *   not reason over an incomplete packet.
 * - File too large after truncation: uses truncated content + warning marker.
 *
 * The executor proceeds either way — embedding is best-effort. The LLM's
 * "insufficient content within boundary" rule (see executor system prompt)
 * handles the case where missing content blocks lens reasoning.
 */

import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

export interface EmbedderOptions {
  ontoHome: string;
  projectRoot: string;
  /** Override default max embed lines per file. */
  maxEmbedLines?: number;
}

const DEFAULT_MAX_EMBED_LINES = 500;

/**
 * Expand ref-only domain document references in `packetText` into inline
 * content blocks.
 *
 * Matches markdown bullet lines that look like:
 *   - Primary: <path>.md
 *   - Supplementary: <path>.md
 * where <path> may contain `~/` or absolute paths. The match is intentionally narrow to avoid embedding
 * arbitrary paths mentioned elsewhere in the packet.
 */
export function embedInlineContext(
  packetText: string,
  options: EmbedderOptions,
): string {
  const maxLines = options.maxEmbedLines ?? DEFAULT_MAX_EMBED_LINES;

  // Find lines like "- Primary: <path>.md" or "- Supplementary: <path>.md"
  // (matches both English and Korean section labels via flexible prefix).
  const refLineRegex = /^(\s*-\s+(?:Primary|Supplementary|primary|supplementary|기본|보조)\s*:\s+)(\S+\.md)\s*$/gmu;

  let modified = false;
  const result = packetText.replace(refLineRegex, (_match, prefix, refPath) => {
    const resolved = expandPath(refPath, options);
    const content = readFileSafe(resolved, maxLines);
    if (!content) {
      throw new Error(
        `Inline context reference does not exist or is unreadable: ref=${refPath}, resolved=${resolved}`,
      );
    }
    modified = true;
    const filename = path.basename(resolved);
    return `${prefix}${refPath}\n\n  <details><summary>Inline content (${filename})</summary>\n\n${indentBlock(content, "  ")}\n\n  </details>`;
  });

  if (!modified) {
    // No domain doc refs found or all failed — return original packet plus
    // a header noting embed was attempted, so downstream consumer knows.
    return result;
  }

  return [
    "<!-- inline-context-embedder: domain doc references expanded -->",
    "",
    result,
  ].join("\n");
}

function expandPath(refPath: string, options: EmbedderOptions): string {
  let p = refPath.trim();

  // Expand ~ to home dir
  if (p.startsWith("~/")) {
    p = path.join(os.homedir(), p.slice(2));
  } else if (p === "~") {
    p = os.homedir();
  }

  // Expand ~/.onto → ontoHome (if user customized ONTO_HOME)
  if (p.startsWith(path.join(os.homedir(), ".onto"))) {
    p = p.replace(path.join(os.homedir(), ".onto"), options.ontoHome);
  }

  // If still relative, resolve against projectRoot
  if (!path.isAbsolute(p)) {
    p = path.resolve(options.projectRoot, p);
  }

  return p;
}

function readFileSafe(filePath: string, maxLines: number): string | null {
  try {
    if (!fsSync.existsSync(filePath)) return null;
    const content = fsSync.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    if (lines.length <= maxLines) return content;
    const truncated = lines.slice(0, maxLines).join("\n");
    return `${truncated}\n\n[...truncated: ${lines.length - maxLines} more lines omitted by inline-context-embedder...]`;
  } catch {
    return null;
  }
}

function indentBlock(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join("\n");
}
