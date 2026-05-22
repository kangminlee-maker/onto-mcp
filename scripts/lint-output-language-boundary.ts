#!/usr/bin/env tsx
/**
 * Output Language Boundary Lint
 *
 * Enforces `.onto/principles/output-language-boundary.md` in CI.
 * Scans the repo for violations of the internal-English / external-translate
 * policy and exits non-zero when any are found.
 *
 * Current checks (progressive — more will be added as authors adopt the
 * render-for-user seat):
 *
 *   R1. Prohibited pattern in prompts/instructions:
 *         `Respond in {output_language}`
 *       Anywhere outside the allowlist is a violation. The pattern is the
 *       exact literal the previous (pre-boundary) agent prompts used; it
 *       directs an LLM to respond in a variable language, which is exactly
 *       what the principle forbids inside agent hand-off paths.
 *
 *   R2. Static validation of `renderForUser({renderPointId: "X"})` calls:
 *       every literal-string renderPointId in `src/` MUST exist in
 *       `.onto/authority/external-render-points.yaml`. This duplicates the
 *       runtime check in render-for-user.ts but catches violations at
 *       CI time before they reach production. Dynamic (non-literal)
 *       renderPointId arguments are skipped (can't be statically
 *       validated) — those fall back to the runtime check.
 *       See .onto/principles/output-language-boundary.md §8/§9.
 *
 *   R3/R4/R5. Translation policy consistency (output-language-boundary §9
 *       Layer 4). Enforces the lexicon (core-lexicon.yaml) ↔ translation
 *       glossary (.onto/authority/translation-glossary/{lang}.yaml) contract.
 *       v0.21.0 policy: default_mode=preserved. bilingual mode abolished.
 *         R3. Lexicon entry with explicit translation_mode=translated MUST
 *             have a glossary entry that includes `translated_label`
 *             (renderer needs the substitution source).
 *         R4. Glossary entry's mode MUST match the lexicon's declared mode.
 *         R5. Glossary entry's term_id MUST exist as a lexicon entity key
 *             or term_id.
 *       preserved entries (default or explicit) are documented in the
 *       glossary for rationale purposes only — not enforced by lint.
 *
 * Usage:
 *   npx tsx scripts/lint-output-language-boundary.ts
 *   npm run lint:output-language-boundary
 *
 * Exit code 0 = pass, 1 = violations found.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

interface Violation {
  rule: string;
  file: string;
  line: number;
  excerpt: string;
  guidance: string;
}

/**
 * Files that are permitted to contain the prohibited pattern because they
 * describe it (principle doc, lint script itself, archived notes).
 * Paths are repo-relative.
 */
const R1_ALLOWLIST: readonly string[] = [
  ".onto/principles/output-language-boundary.md",
  "scripts/lint-output-language-boundary.ts",
];

const R1_PATTERN = /Respond in \{output_language\}/;
const R1_GUIDANCE =
  "Agent prompts must not direct the LLM to respond in a variable language. " +
  "Replace with `Respond in English` + a note about the Runtime Coordinator's render seat. " +
  "See .onto/principles/output-language-boundary.md §3.1.";

/**
 * R2: renderForUser call with literal renderPointId string.
 * Matches `renderForUser({renderPointId: "X"` or `renderForUser({renderPointId: 'X'`
 * across line breaks (object literal may span lines). Captures the id value.
 * Dynamic (variable/expression) renderPointId is NOT matched — skipped, runtime
 * check protects those calls.
 */
const R2_CALL_PATTERN =
  /renderForUser\s*\(\s*\{[^}]*?renderPointId\s*:\s*["']([a-zA-Z0-9_\-]+)["']/gs;
const R2_REGISTRY_PATH = ".onto/authority/external-render-points.yaml";
const R2_GUIDANCE_TEMPLATE = (id: string, known: string): string =>
  `renderPointId "${id}" is not registered in ${R2_REGISTRY_PATH}. ` +
  `Add an entry (rationale: post-call no agent consumption) or fix the id. ` +
  `Known ids: ${known}. See .onto/principles/output-language-boundary.md §4.`;

/**
 * Directories scanned by default. The blanket `.onto/` entry in
 * `IGNORED_DIRECTORIES` below blocks walking into runtime artifacts from above;
 * explicit scan roots include only versioned authority/process/principle/role
 * seats. We still skip `dist/`, `node_modules/`, and `.git/`.
 */
const SCAN_ROOTS: readonly string[] = [
  ".onto/processes",
  ".onto/principles",
  ".onto/authority",
  ".onto/roles",
  "src",
  "scripts",
  "development-records",
];

const SCAN_TOP_LEVEL_FILES: readonly string[] = [
  "process.md",
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
];

const FILE_EXTENSIONS = new Set([".md", ".ts", ".yaml", ".yml"]);

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  ".onto",
  ".claude",
  "coverage",
]);

function listFiles(root: string): string[] {
  const result: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name);
      if (!FILE_EXTENSIONS.has(ext)) continue;
      result.push(full);
    }
  };
  walk(root);
  return result;
}

function repoRelative(absolute: string): string {
  return path.relative(REPO_ROOT, absolute);
}

/**
 * Parse `.onto/authority/external-render-points.yaml` to extract the set of
 * registered `id:` values. Uses a minimal line-scan — the file is a simple
 * points: list-of-records shape. Avoids adding a YAML dep.
 */
function loadRegisteredRenderPointIds(): Set<string> {
  const registryAbs = path.join(REPO_ROOT, R2_REGISTRY_PATH);
  const ids = new Set<string>();
  let content: string;
  try {
    content = fs.readFileSync(registryAbs, "utf8");
  } catch {
    return ids; // empty set — registry missing is a separate concern
  }
  let inPoints = false;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (/^points:\s*$/.test(line)) {
      inPoints = true;
      continue;
    }
    if (!inPoints) continue;
    const idMatch = /^\s*-\s*id:\s*"?([a-zA-Z0-9_\-]+)"?/.exec(line);
    if (idMatch && idMatch[1] !== undefined) {
      ids.add(idMatch[1]);
    }
  }
  return ids;
}

const REGISTERED_IDS = loadRegisteredRenderPointIds();

// ─── R3/R4/R5: Translation policy consistency ───

const LEXICON_PATH = ".onto/authority/core-lexicon.yaml";
const GLOSSARY_DIR = ".onto/authority/translation-glossary";
const SUPPORTED_LANGS: readonly string[] = ["ko"];

// v0.21.0: bilingual mode abolished. default_mode=preserved.
type TranslationMode = "preserved" | "translated";

interface LexiconTerm {
  key: string; // entity key OR term_id
  mode: TranslationMode | null;
  sourceLine: number;
}

interface GlossaryEntry {
  term_id: string;
  mode: TranslationMode | null;
  translated_label: string | null;
  sourceLine: number;
}

/**
 * Parse core-lexicon.yaml for entity-level and term-level translation_mode
 * declarations. Handles both `- term_id: "X"` (terms) and top-level `  X:`
 * (entities) + their `translation_mode: "Y"` lines by proximity scan.
 */
function loadLexiconTranslationModes(): LexiconTerm[] {
  const lexiconAbs = path.join(REPO_ROOT, LEXICON_PATH);
  const terms: LexiconTerm[] = [];
  let content: string;
  try {
    content = fs.readFileSync(lexiconAbs, "utf8");
  } catch {
    return terms;
  }

  const lines = content.split(/\r?\n/);

  // Entity section: indent-2 keys inside `entities:` block.
  let inEntities = false;
  let currentEntityKey: string | null = null;
  let currentEntityLine = 0;

  // Term section: `- term_id: "X"` inside `terms:` block.
  let currentTermId: string | null = null;
  let currentTermLine = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const line = raw.replace(/#.*$/, "").trimEnd();

    if (/^entities:\s*$/.test(line)) {
      inEntities = true;
      continue;
    }
    if (/^terms:\s*$/.test(line)) {
      inEntities = false;
      continue;
    }

    // Entity header: `  {entity_key}:` at exactly 2 spaces
    const entityMatch = inEntities ? /^  ([a-z_][a-z0-9_]*):\s*$/.exec(line) : null;
    if (entityMatch && entityMatch[1] !== undefined) {
      if (currentEntityKey !== null) {
        terms.push({ key: currentEntityKey, mode: null, sourceLine: currentEntityLine });
      }
      currentEntityKey = entityMatch[1];
      currentEntityLine = i + 1;
      continue;
    }

    // Term header: `- term_id: "X"`
    const termMatch = /^\s*-\s*term_id:\s*"([^"]+)"/.exec(line);
    if (termMatch && termMatch[1] !== undefined) {
      if (currentTermId !== null) {
        terms.push({ key: currentTermId, mode: null, sourceLine: currentTermLine });
      }
      currentTermId = termMatch[1];
      currentTermLine = i + 1;
      continue;
    }

    // translation_mode: "X" — attach to closest preceding header
    const modeMatch = /^\s*translation_mode:\s*"([a-z]+)"/.exec(line);
    if (modeMatch && modeMatch[1] !== undefined) {
      const mode = modeMatch[1] as TranslationMode;
      // Prefer the most recent header (entity or term — whichever is closer)
      if (
        currentTermId !== null &&
        currentTermLine > currentEntityLine
      ) {
        terms.push({ key: currentTermId, mode, sourceLine: currentTermLine });
        currentTermId = null;
      } else if (currentEntityKey !== null) {
        terms.push({ key: currentEntityKey, mode, sourceLine: currentEntityLine });
        currentEntityKey = null;
      }
    }
  }

  // Flush trailing headers without mode
  if (currentEntityKey !== null) {
    terms.push({ key: currentEntityKey, mode: null, sourceLine: currentEntityLine });
  }
  if (currentTermId !== null) {
    terms.push({ key: currentTermId, mode: null, sourceLine: currentTermLine });
  }

  return terms;
}

/**
 * Parse .onto/authority/translation-glossary/{lang}.yaml entries.
 */
function loadGlossary(lang: string): GlossaryEntry[] {
  const glossaryAbs = path.join(REPO_ROOT, GLOSSARY_DIR, `${lang}.yaml`);
  const entries: GlossaryEntry[] = [];
  let content: string;
  try {
    content = fs.readFileSync(glossaryAbs, "utf8");
  } catch {
    return entries;
  }

  const lines = content.split(/\r?\n/);
  let current: Partial<GlossaryEntry> | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const line = raw.replace(/#.*$/, "").trimEnd();

    const termIdMatch = /^\s*-\s*term_id:\s*"([^"]+)"/.exec(line);
    if (termIdMatch && termIdMatch[1] !== undefined) {
      if (current !== null && current.term_id !== undefined) {
        entries.push(current as GlossaryEntry);
      }
      current = {
        term_id: termIdMatch[1],
        mode: null,
        translated_label: null,
        sourceLine: i + 1,
      };
      continue;
    }

    const modeMatch = /^\s*mode:\s*"([a-z]+)"/.exec(line);
    if (modeMatch && modeMatch[1] !== undefined && current !== null) {
      current.mode = modeMatch[1] as TranslationMode;
      continue;
    }

    const labelMatch = /^\s*translated_label:\s*"([^"]+)"/.exec(line);
    if (labelMatch && labelMatch[1] !== undefined && current !== null) {
      current.translated_label = labelMatch[1];
    }
  }

  if (current !== null && current.term_id !== undefined) {
    entries.push(current as GlossaryEntry);
  }
  return entries;
}

function checkTranslationPolicy(violations: Violation[]): void {
  const lexiconTerms = loadLexiconTranslationModes();
  const lexiconMap = new Map<string, LexiconTerm>();
  for (const t of lexiconTerms) lexiconMap.set(t.key, t);

  for (const lang of SUPPORTED_LANGS) {
    const glossary = loadGlossary(lang);
    const glossaryMap = new Map<string, GlossaryEntry>();
    for (const e of glossary) glossaryMap.set(e.term_id, e);

    const glossaryFile = path.join(GLOSSARY_DIR, `${lang}.yaml`);

    // R3 (v0.21.0): lexicon with explicit translation_mode=translated MUST
    // have glossary entry with translated_label (renderer needs source).
    // preserved entries are documentation-only, not enforced here.
    for (const t of lexiconTerms) {
      if (t.mode !== "translated") continue;
      const entry = glossaryMap.get(t.key);
      if (entry === undefined) {
        violations.push({
          rule: "R3",
          file: LEXICON_PATH,
          line: t.sourceLine,
          excerpt: `${t.key}: translation_mode=translated`,
          guidance: `Lexicon declares translation_mode=translated for "${t.key}" but no entry in ${glossaryFile}. Add a glossary entry with translated_label.`,
        });
        continue;
      }
      if (entry.translated_label === null || entry.translated_label.length === 0) {
        violations.push({
          rule: "R3",
          file: glossaryFile,
          line: entry.sourceLine,
          excerpt: `${t.key}: mode=translated but translated_label missing`,
          guidance: `Glossary entry for "${t.key}" has mode=translated but no translated_label. Add translated_label so the renderer can substitute.`,
        });
      }
    }

    // R4: glossary entry mode MUST match lexicon declared mode
    for (const e of glossary) {
      const lexEntry = lexiconMap.get(e.term_id);
      if (lexEntry === undefined) continue; // R5 handles this
      if (lexEntry.mode === null) {
        violations.push({
          rule: "R4",
          file: glossaryFile,
          line: e.sourceLine,
          excerpt: `${e.term_id}: mode=${e.mode} (lexicon has no explicit mode)`,
          guidance: `Glossary declares mode="${e.mode}" for "${e.term_id}" but lexicon has no explicit translation_mode. Add translation_mode to the lexicon entry or remove the glossary entry.`,
        });
        continue;
      }
      if (lexEntry.mode !== e.mode) {
        violations.push({
          rule: "R4",
          file: glossaryFile,
          line: e.sourceLine,
          excerpt: `${e.term_id}: mode=${e.mode} vs lexicon=${lexEntry.mode}`,
          guidance: `Glossary mode "${e.mode}" does not match lexicon mode "${lexEntry.mode}" for "${e.term_id}". Align the two.`,
        });
      }
    }

    // R5: glossary term_id MUST exist in lexicon
    for (const e of glossary) {
      if (!lexiconMap.has(e.term_id)) {
        violations.push({
          rule: "R5",
          file: glossaryFile,
          line: e.sourceLine,
          excerpt: `${e.term_id} (not found in lexicon)`,
          guidance: `Glossary references term_id "${e.term_id}" but no such entity key or term_id exists in ${LEXICON_PATH}.`,
        });
      }
    }
  }
}

function scanFile(absolutePath: string, violations: Violation[]): void {
  const rel = repoRelative(absolutePath);

  let content: string;
  try {
    content = fs.readFileSync(absolutePath, "utf8");
  } catch {
    return;
  }

  // R1 — applies to non-allowlisted files only
  if (!R1_ALLOWLIST.includes(rel)) {
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (R1_PATTERN.test(line)) {
        violations.push({
          rule: "R1",
          file: rel,
          line: i + 1,
          excerpt: line.trim(),
          guidance: R1_GUIDANCE,
        });
      }
    }
  }

  // R2 — renderForUser call with unregistered literal renderPointId.
  // Scanned only in src/ (TS callers). test fixtures that inject their own
  // registry via setRegistryPathForTesting are excluded by path.
  if (rel.startsWith("src/") && !rel.includes(".test.")) {
    R2_CALL_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = R2_CALL_PATTERN.exec(content)) !== null) {
      const id = match[1];
      if (id === undefined) continue;
      if (REGISTERED_IDS.has(id)) continue;
      const lineNumber = content.slice(0, match.index).split(/\r?\n/).length;
      const knownPreview = [...REGISTERED_IDS].slice(0, 3).join(", ") +
        (REGISTERED_IDS.size > 3 ? ", ..." : "") +
        (REGISTERED_IDS.size === 0 ? "(none)" : "");
      violations.push({
        rule: "R2",
        file: rel,
        line: lineNumber,
        excerpt: match[0],
        guidance: R2_GUIDANCE_TEMPLATE(id, knownPreview),
      });
    }
  }
}

function main(): void {
  const allFiles: string[] = [];
  for (const root of SCAN_ROOTS) {
    const absRoot = path.join(REPO_ROOT, root);
    if (!fs.existsSync(absRoot)) continue;
    allFiles.push(...listFiles(absRoot));
  }
  for (const file of SCAN_TOP_LEVEL_FILES) {
    const abs = path.join(REPO_ROOT, file);
    if (fs.existsSync(abs)) allFiles.push(abs);
  }

  const violations: Violation[] = [];
  for (const file of allFiles) scanFile(file, violations);

  // R3/R4/R5: translation policy consistency (lexicon ↔ glossary)
  checkTranslationPolicy(violations);

  if (violations.length === 0) {
    process.stdout.write(
      `[lint:output-language-boundary] clean — ${allFiles.length} files scanned, 0 violations.\n`,
    );
    process.exit(0);
  }

  process.stderr.write(
    `[lint:output-language-boundary] ${violations.length} violation(s) found across ${allFiles.length} files:\n\n`,
  );
  const byRule = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byRule.get(v.rule) ?? [];
    list.push(v);
    byRule.set(v.rule, list);
  }
  for (const [rule, list] of byRule) {
    process.stderr.write(`── Rule ${rule} ──\n`);
    for (const v of list) {
      process.stderr.write(`  ${v.file}:${v.line}\n`);
      process.stderr.write(`    ${v.excerpt}\n`);
    }
    if (list.length > 0) {
      process.stderr.write(`  guidance: ${list[0].guidance}\n\n`);
    }
  }
  process.stderr.write(
    "Fix the listed lines or add the file to the rule's allowlist in " +
      "scripts/lint-output-language-boundary.ts (only for legitimate " +
      "description / historical reference cases — not to silence a real " +
      "violation).\n",
  );
  process.exit(1);
}

main();
