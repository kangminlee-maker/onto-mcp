/**
 * Phase 3 Promote — Phase B Orchestrator (Step 10b).
 *
 * Design authority:
 *   - learn-phase3-design-v9.md DD-15 (Phase B atomicity + dual failure modes)
 *   - learn-phase3-design-v9.md DD-22 (recovery context + canonical attempt selection)
 *   - learn-phase3-design-v9.md DD-23 (RecoveryResolution operator seat)
 *   - learn-phase3-design-v8.md DD-16 (recoverability checkpoint)
 *   - learn-phase3-design-v5.md §1.3 Phase B canonical sequence
 *   - .onto/processes/learn/promote.md Step 6 (Promotion Execution)
 *
 * Responsibility:
 *   - Load PromoteReport + PromoteDecisions for a session.
 *   - Verify baseline freshness (DD-10) — abort with stale_baseline degraded
 *     state when files have shifted unless --force-stale.
 *   - Recovery: gather context, resolve truth, route manual_escalation to
 *     operator. When --resume, load prior ApplyExecutionState.
 *   - Create recoverability checkpoint (DD-16) before any mutation.
 *   - Initialize ApplyExecutionState (DD-15 + DD-22 attempt_id).
 *   - Apply approved decisions in order, persisting state on each step:
 *       1. promotions          (append to global file)
 *       2. contradiction_replacements (in-place line replace)
 *       3. axis_tag_changes    (in-place line edit)
 *       4. retirements         (delete or comment out)
 *       5. audit_outcomes      (modify/delete based on audit)
 *       6. obligation_waive    (audit-state transition)
 *       7. cross_agent_dedup_approvals (scope-aware line-level mark +
 *          consolidated append, CG1/CG2/UF1 fixes applied)
 *       8. domain_doc_updates  (LLM content generation + file update)
 *   - Transition status: in_progress → completed | failed_resumable |
 *     apply_verification_failed.
 *   - Emergency log on state_persistence_failed (DD-15 dual failure).
 *
 * File-mutation contract:
 *   - All learning file edits are line-level operations against the .md
 *     storage. We use simple string-replace because the file format is one
 *     learning per line + optional `<!-- learning_id: ... -->` comment line.
 *   - Backups go through createRecoverabilityCheckpoint() before any edit
 *     so a single restore command can roll back the whole attempt.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { callLlm } from "../shared/llm-caller.js";
import { REGISTRY } from "../shared/artifact-registry.js";
import {
  loadAuditState,
  saveAuditState,
  findObligation,
  type AuditState,
} from "../shared/audit-state.js";
import {
  createRecoverabilityCheckpoint,
} from "../shared/recoverability.js";
import {
  gatherRecoveryContext,
  resolveRecoveryTruth,
  buildEscalationMessage,
  getSessionPromoteRoot,
  EMERGENCY_LOG_PATH,
  type RecoveryResolutionPolicy,
} from "../shared/recovery-context.js";
import { verifyBaselineHash } from "./collector.js";
import {
  generateUlid,
  initApplyState,
  loadApplyState,
  markApplied,
  markFailed,
  persistApplyState,
  transitionStatus,
} from "./apply-state.js";
import type {
  AppliedDecision,
  ApplyExecutionState,
  AuditOutcomeDecision,
  AxisTagChangeDecision,
  ContradictionReplacementDecision,
  CrossAgentDedupCluster,
  CrossAgentDedupDecision,
  DomainDocCandidate,
  ParsedLearningItem,
  PendingDecisionRef,
  PromoteDecisions,
  PromoteReport,
  PromotionDecision,
  RetirementDecision,
} from "./types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RunPromoteExecutorConfig {
  sessionId: string;
  projectRoot: string;
  /** Override `~/.onto/`. */
  ontoHome?: string;
  /** Override session root path. */
  sessionRoot?: string;
  /** Override audit-state path. */
  auditStatePath?: string;
  /** Resume a prior failed attempt. */
  resume?: boolean;
  /** Skip baseline freshness check (sets stale_baseline to warning only). */
  forceStale?: boolean;
  /** Recovery resolution policy override. Defaults to manual_escalation. */
  recoveryPolicy?: RecoveryResolutionPolicy;
  /** Dry run: prepare and verify but do not actually apply. */
  dryRun?: boolean;
  /** LLM model id override forwarded to domain-doc Phase B content generation. */
  modelId?: string;
}

export type RunPromoteExecutorOutcome =
  | {
      kind: "completed";
      state: ApplyExecutionState;
      statePath: string;
      summary: ExecutionSummary;
    }
  | {
      kind: "failed_resumable";
      state: ApplyExecutionState;
      statePath: string;
      summary: ExecutionSummary;
      reason: string;
    }
  | {
      kind: "stale_baseline";
      mismatches: ReturnType<typeof verifyBaselineHash>;
      message: string;
    }
  | {
      kind: "manual_escalation_required";
      message: string;
    }
  | {
      kind: "no_decisions";
      message: string;
    };

export interface ExecutionSummary {
  promotions_applied: number;
  contradiction_replacements_applied: number;
  axis_tag_changes_applied: number;
  retirements_applied: number;
  audit_outcomes_applied: number;
  obligations_waived: number;
  cross_agent_dedup_applied: number;
  domain_doc_updates_applied: number;
  failed_decisions: number;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function resolveSessionRoot(config: RunPromoteExecutorConfig): string {
  return (
    config.sessionRoot ?? getSessionPromoteRoot(config.projectRoot, config.sessionId)
  );
}

function resolveAuditStatePath(config: RunPromoteExecutorConfig): string {
  if (config.auditStatePath) return config.auditStatePath;
  const home = config.ontoHome ?? path.join(os.homedir(), ".onto");
  return path.join(home, "audit-state.yaml");
}

function getGlobalLearningFilePath(agentId: string, ontoHome?: string): string {
  const home = ontoHome ?? path.join(os.homedir(), ".onto");
  return path.join(home, "learnings", `${agentId}.md`);
}

function getProjectLearningFilePath(projectRoot: string, agentId: string): string {
  return path.join(projectRoot, ".onto", "learnings", `${agentId}.md`);
}

// ---------------------------------------------------------------------------
// Decision applicators (per-kind file mutators)
// ---------------------------------------------------------------------------

function decisionId(kind: string, identity: string): string {
  // Stable string id derived from per-decision identity. Used by
  // markApplied/markFailed to track pending → applied/failed transitions.
  return `${kind}::${identity}`;
}

/**
 * Alias used by the apply-loop guards. Same shape as decisionId, named more
 * explicitly so the call sites read as "the decision id for this kind".
 */
function decisionIdFor(
  kind: AppliedDecision["decision_kind"],
  identity: string,
): string {
  return decisionId(kind, identity);
}

/**
 * Write an emergency log entry to ~/.onto/emergency-log.jsonl when
 * persistApplyState fails. The entry preserves the in-memory state snapshot
 * + attempt_id + generation so a future recovery run (gatherRecoveryContext)
 * can reconstruct the apply state from this log even if the on-disk
 * promote-execution-result.json is corrupted or missing.
 *
 * B-B fix: previously, persistApplyState failures were caught only at the
 * outer catastrophic try, which then called persistApplyState AGAIN. If
 * disk had already failed, the second call also failed and the executor
 * crashed without recording the side effects anywhere durable. The
 * emergency log gives recovery a fall-back source even when the in-band
 * artifact is unwritable.
 */
interface EmergencyLogEntryArgs {
  sessionId: string;
  sessionRoot: string;
  attemptId: string;
  generation: number;
  fatalErrorKind: "state_persistence_failed" | "emergency_log_double_failure";
  fatalErrorMessage: string;
  snapshot: ApplyExecutionState;
}

function writeEmergencyLogEntry(args: EmergencyLogEntryArgs): void {
  const entry = {
    schema_version: "1" as const,
    entry_id: crypto.randomBytes(8).toString("hex"),
    session_id: args.sessionId,
    written_at: new Date().toISOString(),
    attempt_id: args.attemptId,
    generation: args.generation,
    fatal_error_kind: args.fatalErrorKind,
    fatal_error_message: args.fatalErrorMessage,
    last_known_state_snapshot: {
      status: args.snapshot.status,
      applied_count: args.snapshot.applied_decisions.length,
      failed_count: args.snapshot.failed_decisions.length,
      pending_count: args.snapshot.pending_decisions.length,
    },
    recoverability_checkpoint: null,
    partial_decisions_attempted: args.snapshot.applied_decisions,
    session_root: args.sessionRoot,
  };
  try {
    fs.mkdirSync(path.dirname(EMERGENCY_LOG_PATH), { recursive: true });
    fs.appendFileSync(EMERGENCY_LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch (logError) {
    // Double failure: emergency log itself can't be written. There is
    // nothing more durable we can do — surface to stderr so at least the
    // process output captures the loss.
    process.stderr.write(
      `[promote-executor] FATAL: emergency log write failed after persistence ` +
        `failure. session=${args.sessionId} attempt=${args.attemptId} ` +
        `gen=${args.generation} kind=${args.fatalErrorKind} ` +
        `original_error=${args.fatalErrorMessage} ` +
        `log_error=${logError instanceof Error ? logError.message : String(logError)}\n`,
    );
  }
}

function ensureFileExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "<!-- format_version: 1 -->\n", "utf8");
  }
}

/**
 * Append a learning line + learning_id comment to the target file.
 *
 * Phase 2 extractor pattern: line followed by `<!-- learning_id: <hash> -->`
 * marker on the next line so future runs can dedup against the durable id.
 */
function appendLearningLine(
  filePath: string,
  line: string,
  learningId: string,
): void {
  ensureFileExists(filePath);
  // Guard against existing files that lack a trailing newline: without this
  // the new block would concatenate onto the last existing line (e.g. a
  // comment marker written by replaceLineInFile), producing lines like
  // `<!-- ... -->- [fact] ...`. Peek at the last byte and prepend a newline
  // if needed.
  let leading = "";
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 0) {
      const fd = fs.openSync(filePath, "r");
      try {
        const tail = Buffer.alloc(1);
        fs.readSync(fd, tail, 0, 1, stat.size - 1);
        if (tail[0] !== 0x0a /* \n */) leading = "\n";
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch {
    // stat/open failure falls through to the plain append path
  }
  const block = `${leading}${line}\n<!-- learning_id: ${learningId} taxonomy_version: phase3-promoted -->\n`;
  fs.appendFileSync(filePath, block, "utf8");
}

/**
 * Replace the first line in the file that matches `existingLine` with
 * `newLine`. Returns true on success, false when no match was found.
 *
 * Used by contradiction_replacement and axis_tag_change. NOT used by
 * cross_agent_dedup — that path uses replaceLineAtIndex to honor the
 * resolved anchor (see SYN-C2 fix).
 */
function replaceLineInFile(
  filePath: string,
  existingLine: string,
  newLine: string,
): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === existingLine) {
      lines[i] = newLine;
      fs.writeFileSync(filePath, lines.join("\n"), "utf8");
      return true;
    }
  }
  return false;
}

/**
 * Replace the line at exact `lineIndex` with `newLine`, only if the
 * existing content at that index still equals `expectedLine` (optimistic
 * concurrency check). Returns true on success, false when the index is
 * out of bounds or the on-disk content at that index drifted.
 *
 * Used by cross_agent_dedup where the caller has a resolved anchor
 * (SYN-C2). Keeping the mutation bound to the resolved index prevents
 * the "first-verbatim-match" regression that made preflight useless
 * for duplicate raw_line files.
 *
 * NOTE: this helper is a LINE-LEVEL CAS only. It does NOT protect against
 * lost updates from concurrent writes to OTHER lines in the same file.
 * When that matters (cross_agent_dedup apply), the caller wraps the
 * read-modify-write in withFileLock so the entire file-level transition
 * is serialized against other processes (4-D1(a)).
 */
function replaceLineAtIndex(
  filePath: string,
  lineIndex: number,
  expectedLine: string,
  newLine: string,
): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return false;
  if (lines[lineIndex] !== expectedLine) return false;
  lines[lineIndex] = newLine;
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  return true;
}

// -----------------------------------------------------------------------
// Non-spinning synchronous sleep for withFileLock's backoff.
// -----------------------------------------------------------------------
// Atomics.wait blocks the current thread without CPU spin. Backed by a
// SharedArrayBuffer-based Int32Array so we can call Atomics.wait on it.
// The buffer is reused across calls (module-scoped) so repeated waits
// don't allocate new SharedArrayBuffers. Atomics.wait(view, 0, 0, ms)
// blocks until either (a) the cell at index 0 changes from 0, or (b) the
// timeout ms elapses. We never mutate the cell, so every wait runs the
// full timeout without CPU overhead.
const __lockSleepBuf = new Int32Array(new SharedArrayBuffer(4));
function sleepSyncMs(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(__lockSleepBuf, 0, 0, ms);
}

/**
 * Parse the PID from the first line of a lockfile's content.
 * Returns null when the content is malformed or unreadable.
 */
function readLockHolderPid(lockPath: string): number | null {
  try {
    const content = fs.readFileSync(lockPath, "utf8");
    const firstLine = content.split("\n")[0]?.trim();
    if (!firstLine) return null;
    const pid = Number.parseInt(firstLine, 10);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

/**
 * Check whether a given PID is alive on this host. Uses `process.kill(pid, 0)`
 * which is the POSIX idiom: the signal 0 doesn't actually signal anything
 * but does perform the kernel's existence check.
 *
 * Return contract (6-SYN-CC1 clarification):
 *   - `true`  → the process provably exists. This covers two sub-cases:
 *       (a) the kill(0) succeeded — we own or can signal the PID
 *       (b) the kill(0) failed with EPERM — the PID is registered with the
 *           kernel but we lack permission to signal it. EPERM is a
 *           POSITIVE existence signal: the OS only raises EPERM when the
 *           target exists. We deliberately treat EPERM as "alive" so
 *           reclaim fails-closed on a live-but-unreachable holder (e.g.
 *           another user's promote process on a shared host).
 *   - `false` → the process does NOT exist (ESRCH). Safe to reclaim.
 *   - `null`  → indeterminate (any other error code). Reclaim must NOT
 *               fire — caller treats null the same as true.
 *
 * Consumers should interpret "not false" as alive: only a definitive
 * ESRCH response authorizes stale-lock reclaim.
 */
function isPidAlive(pid: number): boolean | null {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code =
      err instanceof Error && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ESRCH") return false;
    // EPERM: the PID exists (kernel raised EPERM instead of ESRCH) but
    // we can't signal it. Per the contract above, treat as alive so we
    // never reclaim a lockfile whose holder we just couldn't probe.
    if (code === "EPERM") return true;
    return null;
  }
}

/**
 * Acquire a BEST-EFFORT ADVISORY file-level lock on `targetPath` using a
 * sibling `.lock` file opened with O_CREAT|O_EXCL (atomic on POSIX). Run
 * `fn` while holding the lock; release via unlink on exit.
 *
 * ===========================================================================
 * CONTRACT (6-SYN-C1 rewording)
 * ===========================================================================
 * withFileLock provides ADVISORY mutual exclusion suitable for the
 * single-operator, single-host Phase 3 deployment model. It is NOT a
 * strong POSIX file lock and does NOT provide:
 *
 *   - Kernel-enforced exclusivity: peers that ignore the lockfile
 *     convention are not blocked. This is a cooperative protocol.
 *
 *   - Network-filesystem or multi-mount semantics: NFS, SMB, and
 *     overlay filesystems do NOT guarantee O_EXCL atomicity across
 *     clients. The helper assumes a single local POSIX filesystem.
 *
 *   - A "dead holder only reclaim" guarantee: the stale-lock reclaim
 *     path runs `stat → PID check → reStat → unlink-by-path`, which
 *     closes the common TOCTOU cases but NOT the narrow race where a
 *     fresh live lockfile is created at the same path after our reStat
 *     and before our unlink. In that window we may delete a peer's
 *     newly-created lockfile. The probability is low under single-
 *     operator cadence (reclaim triggers only after staleAfterMs=2s
 *     of real idle time), but the window is real. Callers that need
 *     strong exclusivity must switch to flock() or an external lock
 *     manager.
 *
 * ===========================================================================
 * SCOPE — this helper is NOT a general "all Phase B mutators are serialized"
 * ===========================================================================
 * withFileLock is intentionally narrow. It exists to serialize the
 * multi-file, multi-step cross_agent_dedup apply flow (CG1/CG2/UF1/SYN-*)
 * where a single logical transaction touches several files and needs
 * in-lock anchor re-resolution to close TOCTOU. Other Phase B applicators
 * (applyPromotion, applyAxisTagChange, applyContradictionReplacement,
 * applyRetirement, etc.) operate on single-line mutations with their own
 * guard semantics (replaceLineInFile + its return-value check). They do
 * NOT route through this lock, and "learning files are globally serialized"
 * is NOT a claim this helper makes.
 *
 * ===========================================================================
 * SEMANTICS
 * ===========================================================================
 *   - Retries on EEXIST for up to `waitMs` (default 5s) with exponential
 *     backoff bounded at 100ms per sleep. Uses Atomics.wait for a
 *     non-spinning synchronous wait — blocks the thread without CPU spin.
 *   - Stale-lock recovery is owner-aware but best-effort: reads the PID
 *     from the lockfile, checks process liveness via kill(pid, 0), and
 *     reclaims only when the holder returns ESRCH (definitely dead).
 *     Any indeterminate (`null`) or live (`true`, including EPERM)
 *     response skips reclaim and the caller falls back into the normal
 *     wait path. Age (staleAfterMs, default 2s) gates the probe so we
 *     don't run kill() on every poll.
 *   - Lockfile payload: `<pid>\n<acquired_at_iso>\n<target_path>\n` so
 *     operators can diagnose holders with `cat` and correlate with `ps`.
 *   - Cleanup is best-effort via finally-unlink. fn's thrown error
 *     propagates out; the lock is released before the error escapes.
 *
 * ===========================================================================
 * RUNTIME FLOOR (6-SYN-C3 + 7-wording cleanup)
 * ===========================================================================
 * Depends on Atomics.wait on a SharedArrayBuffer-backed Int32Array
 * (see sleepSyncMs above).
 *
 * `engines.node` in package.json declares a SUPPORT-POLICY floor, NOT a
 * minimal technical floor. Both Atomics.wait and SharedArrayBuffer have
 * been generally available since much older Node releases (SharedArrayBuffer
 * since Node 10, Atomics.wait since Node 8.3), so technically the helper
 * CAN run on runtimes older than the declared engines.node value. The
 * >=18 floor reflects:
 *   (a) the current Node LTS we intentionally support and test against,
 *   (b) a soft advisory signal to package managers (note: engine-range
 *       enforcement varies per package manager — npm emits a warning by
 *       default, yarn's behavior is configurable, pnpm is strict only
 *       when engine-strict is enabled).
 *
 * This is NOT a claim that 18.0.0 is where Atomics.wait starts working,
 * and it is NOT a universal hard-install gate. Older runtimes may still
 * execute the helper successfully if the bundling path bypasses the
 * engines check; operators running on pre-18 Node do so outside the
 * supported envelope and should not expect the same guarantees.
 */
function withFileLock<T>(
  targetPath: string,
  fn: () => T,
  options: { waitMs?: number; staleAfterMs?: number } = {},
): T {
  const lockPath = `${targetPath}.lock`;
  const waitMs = options.waitMs ?? 5000;
  // Age threshold used as a hint — we only probe PID liveness when the
  // lockfile is at least this old. Shortens the default wait-to-reclaim
  // window to 2s so a dead holder doesn't force the full 5-min hold we
  // had in the prior design.
  const staleAfterMs = options.staleAfterMs ?? 2000;
  const startedAt = Date.now();
  let sleepMs = 10;

  // Ensure parent directory exists so the lockfile can be created.
  const parent = path.dirname(lockPath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }

  while (true) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      try {
        fs.writeSync(
          fd,
          `${process.pid}\n${new Date().toISOString()}\n${targetPath}\n`,
        );
      } finally {
        fs.closeSync(fd);
      }
      break; // Acquired
    } catch (err) {
      const code =
        err instanceof Error && "code" in err
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      if (code !== "EEXIST") throw err;

      // Owner-aware stale-lock reclaim (5-RECLAIM fix).
      //
      // We probe PID liveness when:
      //   (a) the lockfile is older than staleAfterMs (don't hammer the
      //       syscall on every retry), AND
      //   (b) the PID can be parsed from the lockfile content.
      //
      // The reclaim is atomic in the sense of "unlink + retry loop":
      // after unlinking, another contender could win the next open race.
      // That's fine — we're acting as peers at this point, and the loser
      // falls back into the retry path to wait for the next release.
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs >= staleAfterMs) {
          const holderPid = readLockHolderPid(lockPath);
          if (holderPid !== null && isPidAlive(holderPid) === false) {
            // Dead holder — reclaim by unlinking. Verify the file we're
            // about to unlink is still the same file (not replaced by
            // a newer acquirer between stat and unlink) using the inode
            // via fstat. On POSIX we can't atomically "unlink if
            // unchanged", so the best we can do is re-stat and compare.
            try {
              const reStat = fs.statSync(lockPath);
              if (reStat.ino === stat.ino && reStat.mtimeMs === stat.mtimeMs) {
                fs.unlinkSync(lockPath);
              }
            } catch {
              // Lock already gone — someone else reclaimed. Retry below.
            }
            continue; // Try to acquire right away.
          }
        }
      } catch {
        // stat failed (maybe the lock was just released) — fall through
        // to the normal retry path.
      }

      if (Date.now() - startedAt > waitMs) {
        throw new Error(
          `withFileLock: could not acquire lock on ${targetPath} within ${waitMs}ms. ` +
            `Another process is likely holding ${lockPath}. ` +
            `If no process is active, inspect the lockfile (contains holder pid + ` +
            `acquired_at) and remove it manually.`,
        );
      }
      // Non-spinning wait — Atomics.wait blocks the thread for sleepMs
      // without CPU consumption (LOCK-SPIN fix).
      sleepSyncMs(Math.min(sleepMs, 100));
      sleepMs = Math.min(sleepMs * 2, 100);
      continue;
    }
  }

  try {
    return fn();
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Cleanup best-effort. If unlink fails, subsequent acquires will
      // eventually recover via the stale-lock path.
    }
  }
}

/**
 * Comment out a line by replacing it with `<!-- retired ({date}): {original} -->`.
 *
 * promote.md §6 says project entries are tagged `(-> promoted to global, ...)`
 * and not deleted. Retirement of GLOBAL entries follows a similar
 * preserve-as-comment pattern so the audit trail survives.
 */
function commentOutLine(filePath: string, existingLine: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const date = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === existingLine) {
      lines[i] = `<!-- retired (${date}): ${existingLine} -->`;
      fs.writeFileSync(filePath, lines.join("\n"), "utf8");
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Per-decision-kind applicators
// ---------------------------------------------------------------------------

interface ApplyContext {
  projectRoot: string;
  ontoHome?: string;
  state: ApplyExecutionState;
  sessionRoot: string;
  /** Mutable count tally — bumped per applicator. */
  summary: ExecutionSummary;
}

/**
 * Apply a single approved promotion. Promotes the project line to the global
 * file under the same agent_id. The original project entry is annotated with
 * `(-> promoted to global, <date>)` per promote.md §6.
 */
function applyPromotion(
  decision: PromotionDecision,
  ctx: ApplyContext,
): void {
  if (!decision.approve) return;

  const id = decisionId("promotion", `${decision.candidate_agent_id}|${decision.candidate_line}`);

  try {
    const globalPath = getGlobalLearningFilePath(
      decision.candidate_agent_id,
      ctx.ontoHome,
    );
    const learningId = hashLine(decision.candidate_line);

    // Append to global. The line itself is the canonical §1.3 form already
    // (collector parsed it as a ParsedLearningItem and the operator approved
    // the literal text).
    appendLearningLine(globalPath, decision.candidate_line, learningId);

    // Annotate the project file: mark the source line as "promoted to global".
    const projectPath = getProjectLearningFilePath(
      ctx.projectRoot,
      decision.candidate_agent_id,
    );
    annotateProjectLine(projectPath, decision.candidate_line);

    ctx.state = markApplied(ctx.state, {
      decision_kind: "promotion",
      decision_id: id,
      applied_at: new Date().toISOString(),
      target_path: globalPath,
      result_summary: `appended to ${path.basename(globalPath)}`,
    });
    ctx.summary.promotions_applied += 1;
  } catch (error) {
    ctx.state = markFailed(ctx.state, {
      decision_kind: "promotion",
      decision_id: id,
      attempted_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      resumable: true,
    });
    ctx.summary.failed_decisions += 1;
  }
}

function annotateProjectLine(filePath: string, line: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const date = new Date().toISOString().slice(0, 10);
  const annotation = ` (-> promoted to global, ${date})`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === line && !lines[i]!.includes("promoted to global")) {
      lines[i] = lines[i] + annotation;
      fs.writeFileSync(filePath, lines.join("\n"), "utf8");
      return;
    }
  }
}

function applyContradictionReplacement(
  decision: ContradictionReplacementDecision,
  ctx: ApplyContext,
): void {
  if (!decision.approve) return;
  const id = decisionId(
    "contradiction_replacement",
    `${decision.agent_id}|${decision.existing_line}`,
  );
  try {
    const globalPath = getGlobalLearningFilePath(decision.agent_id, ctx.ontoHome);
    // Preserve the replaced entry as a comment for audit trail.
    const date = new Date().toISOString().slice(0, 10);
    const preservedLine = `<!-- replaced (${date}): ${decision.existing_line} -->`;
    const ok =
      replaceLineInFile(globalPath, decision.existing_line, preservedLine) &&
      (() => {
        const learningId = hashLine(decision.new_line);
        appendLearningLine(globalPath, decision.new_line, learningId);
        return true;
      })();
    if (!ok) {
      throw new Error(`existing line not found in ${globalPath}`);
    }
    ctx.state = markApplied(ctx.state, {
      decision_kind: "contradiction_replacement",
      decision_id: id,
      applied_at: new Date().toISOString(),
      target_path: globalPath,
      result_summary: `replaced 1 line in ${path.basename(globalPath)}`,
    });
    ctx.summary.contradiction_replacements_applied += 1;
  } catch (error) {
    ctx.state = markFailed(ctx.state, {
      decision_kind: "contradiction_replacement",
      decision_id: id,
      attempted_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      resumable: true,
    });
    ctx.summary.failed_decisions += 1;
  }
}

function applyAxisTagChange(
  decision: AxisTagChangeDecision,
  ctx: ApplyContext,
): void {
  if (!decision.approve) return;
  const id = decisionId("axis_tag_change", `${decision.agent_id}|${decision.original_line}`);
  try {
    const globalPath = getGlobalLearningFilePath(decision.agent_id, ctx.ontoHome);
    const ok = replaceLineInFile(
      globalPath,
      decision.original_line,
      decision.new_line,
    );
    if (!ok) throw new Error(`original line not found in ${globalPath}`);
    ctx.state = markApplied(ctx.state, {
      decision_kind: "axis_tag_change",
      decision_id: id,
      applied_at: new Date().toISOString(),
      target_path: globalPath,
      result_summary: `axis tags updated in ${path.basename(globalPath)}`,
    });
    ctx.summary.axis_tag_changes_applied += 1;
  } catch (error) {
    ctx.state = markFailed(ctx.state, {
      decision_kind: "axis_tag_change",
      decision_id: id,
      attempted_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      resumable: true,
    });
    ctx.summary.failed_decisions += 1;
  }
}

function applyRetirement(
  decision: RetirementDecision,
  ctx: ApplyContext,
  auditState: AuditState,
): void {
  const id = decisionId("retirement", `${decision.agent_id}|${decision.line_excerpt}`);
  if (!decision.approve_retire) {
    // retention_confirmed: append <!-- retention-confirmed: <date> --> after
    // the matching line so future passes know this item was reviewed.
    try {
      const globalPath = getGlobalLearningFilePath(decision.agent_id, ctx.ontoHome);
      const date = new Date().toISOString().slice(0, 10);
      const ok = insertCommentAfter(
        globalPath,
        decision.line_excerpt,
        `<!-- retention-confirmed: ${date} -->`,
      );
      if (!ok) throw new Error(`line not found in ${globalPath}`);
      ctx.state = markApplied(ctx.state, {
        decision_kind: "retirement",
        decision_id: id,
        applied_at: new Date().toISOString(),
        target_path: globalPath,
        result_summary: `retention confirmed in ${path.basename(globalPath)}`,
      });
    } catch (error) {
      ctx.state = markFailed(ctx.state, {
        decision_kind: "retirement",
        decision_id: id,
        attempted_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
        resumable: true,
      });
      ctx.summary.failed_decisions += 1;
    }
    return;
  }

  try {
    const globalPath = getGlobalLearningFilePath(decision.agent_id, ctx.ontoHome);
    const ok = commentOutLine(globalPath, decision.line_excerpt);
    if (!ok) throw new Error(`line not found in ${globalPath}`);
    ctx.state = markApplied(ctx.state, {
      decision_kind: "retirement",
      decision_id: id,
      applied_at: new Date().toISOString(),
      target_path: globalPath,
      result_summary: `retired in ${path.basename(globalPath)}`,
    });
    ctx.summary.retirements_applied += 1;
  } catch (error) {
    ctx.state = markFailed(ctx.state, {
      decision_kind: "retirement",
      decision_id: id,
      attempted_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      resumable: true,
    });
    ctx.summary.failed_decisions += 1;
  }
  // auditState parameter unused for retirement; reserved for future
  // event-marker side-effects (touching obligations linked to retired items).
  void auditState;
}

function insertCommentAfter(
  filePath: string,
  matchLine: string,
  comment: string,
): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === matchLine) {
      lines.splice(i + 1, 0, comment);
      fs.writeFileSync(filePath, lines.join("\n"), "utf8");
      return true;
    }
  }
  return false;
}

function applyAuditOutcome(
  decision: AuditOutcomeDecision,
  ctx: ApplyContext,
): void {
  const id = decisionId(
    "audit_outcome",
    `${decision.agent_id}|${decision.line_excerpt}`,
  );
  try {
    const globalPath = getGlobalLearningFilePath(decision.agent_id, ctx.ontoHome);
    if (decision.decision === "delete") {
      const ok = commentOutLine(globalPath, decision.line_excerpt);
      if (!ok) throw new Error(`line not found in ${globalPath}`);
    } else if (decision.decision === "modify") {
      if (!decision.modified_content) {
        throw new Error(`audit_outcome modify requires modified_content`);
      }
      const ok = replaceLineInFile(
        globalPath,
        decision.line_excerpt,
        decision.modified_content,
      );
      if (!ok) throw new Error(`line not found in ${globalPath}`);
    }
    // retain: no-op
    ctx.state = markApplied(ctx.state, {
      decision_kind: "audit_outcome",
      decision_id: id,
      applied_at: new Date().toISOString(),
      target_path: globalPath,
      result_summary: `audit outcome (${decision.decision}) applied`,
    });
    ctx.summary.audit_outcomes_applied += 1;
  } catch (error) {
    ctx.state = markFailed(ctx.state, {
      decision_kind: "audit_outcome",
      decision_id: id,
      attempted_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      resumable: true,
    });
    ctx.summary.failed_decisions += 1;
  }
}

/**
 * Apply an approved cross-agent dedup cluster (criterion 6).
 *
 * The cluster's primary_owner_agent receives the consolidated_line via the
 * normal append path. Every member item NOT owned by the primary owner is
 * replaced in-place with a `<!-- consolidated into: cluster_id -->` marker
 * so the audit trail survives — promote.md §6 explicitly says retirement-
 * style operations should preserve content as comments.
 *
 * The decision shape only carries cluster_id + approve. The full cluster
 * data (member items, primary owner, consolidated text) lives in
 * PromoteReport.cross_agent_dedup_clusters; the caller passes the matching
 * cluster in via the third arg so the applicator stays a pure function of
 * its inputs.
 */
/**
 * Anchor resolution for cross-agent dedup members (CG2 fix).
 *
 * Identical shape as insight-reclassifier.resolveAnchor but inlined here
 * because the dedup apply runs inside promote-executor and shares no state
 * with the reclassifier module.
 *
 * Three outcomes:
 *   - match_original    → line_number anchor points at the original raw_line
 *                         (or the verbatim scan found a unique match)
 *   - already_consolidated → line_number anchor points at the post-marker
 *                            form (evidence of a previously successful apply)
 *   - ambiguous         → verbatim scan found more than one hit AND the
 *                         line_number anchor didn't resolve → fail-closed
 *   - missing           → neither anchor produced a hit → fail-closed
 */
interface DedupAnchorResolution {
  kind: "match_original" | "already_consolidated" | "ambiguous" | "missing";
  lineIndex: number | null;
}

function resolveDedupMemberAnchor(
  fileLines: string[],
  member: ParsedLearningItem,
  clusterId: string,
): DedupAnchorResolution {
  const rawLine = member.raw_line;
  const date = new Date().toISOString().slice(0, 10);
  // The rewritten form includes a date stamp that we can't predict exactly
  // at resolution time (prior runs used a different date). Match on the
  // stable prefix + cluster_id + raw_line tail instead.
  const expectedMarkerPrefix = `<!-- consolidated (`;
  const expectedMarkerSuffix = `) into ${clusterId}: ${rawLine} -->`;
  void date; // suppress unused warning

  const anchoredIdx = member.line_number - 1;
  if (anchoredIdx >= 0 && anchoredIdx < fileLines.length) {
    const candidate = fileLines[anchoredIdx]!;
    if (candidate === rawLine) {
      return { kind: "match_original", lineIndex: anchoredIdx };
    }
    if (
      candidate.startsWith(expectedMarkerPrefix) &&
      candidate.endsWith(expectedMarkerSuffix)
    ) {
      return { kind: "already_consolidated", lineIndex: anchoredIdx };
    }
  }

  // Verbatim scan fallback — must be unambiguous.
  let firstMatch = -1;
  let matchCount = 0;
  for (let i = 0; i < fileLines.length; i++) {
    if (fileLines[i] === rawLine) {
      if (firstMatch === -1) firstMatch = i;
      matchCount += 1;
      if (matchCount > 1) break;
    }
  }
  if (matchCount === 1 && firstMatch !== -1) {
    return { kind: "match_original", lineIndex: firstMatch };
  }
  if (matchCount > 1) {
    return { kind: "ambiguous", lineIndex: null };
  }
  return { kind: "missing", lineIndex: null };
}

/**
 * C1 + CG1 + CG2 + UF1 + SYN-C1 + SYN-C2 fix: scope-aware, primary-member-
 * precise (index-based), anchor-authoritative, and marker-closure-aware
 * cross-agent dedup apply.
 *
 * C1: Scope-aware — non-primary members apply at their own source_path.
 * Mixed-scope clusters (project + global) correctly mark each member file.
 *
 * CG1 + SYN-C1: Exact primary member identity via `primary_member_index`
 * (zero-based slot in `member_items`). Content-based identity (raw_line)
 * failed when multiple shortlist members shared identical content; slot
 * identity is unambiguous regardless of content duplication.
 *
 * CG2 + SYN-C2: Anchor IS the mutation authority. resolveDedupMemberAnchor
 * returns the exact `lineIndex` that was validated against the original
 * raw_line, and replaceLineAtIndex mutates ONLY that index (with an
 * optimistic-concurrency equality check). The previous code validated
 * one occurrence in preflight but mutated a different occurrence via
 * first-verbatim-match replaceLineInFile.
 *
 * UF1: Cluster marker closure — on rerun with the cluster marker already
 * present in the primary file, we ALSO verify that every member file has
 * its expected consolidated marker. Any missing member marker triggers
 * re-mark to complete a partial prior apply.
 *
 * SYN-CC1 contract: if cluster marker is ABSENT but some members are
 * already_consolidated (crash mid-apply AFTER the ordering flip), the
 * apply fails-closed with an explicit manual-recovery message. This is
 * intentional — automatic recovery of a split state risks data corruption
 * when the shortlist used to produce the partial apply might not match
 * the current one. Operators reset by restoring from the recoverability
 * checkpoint or manually rolling the member markers back.
 */
function applyCrossAgentDedup(
  decision: CrossAgentDedupDecision,
  cluster: CrossAgentDedupCluster,
  ctx: ApplyContext,
): void {
  if (!decision.approve) return;
  const id = decisionId("cross_agent_dedup", decision.cluster_id);
  try {
    // Structural guard — primary_member_index must point at a valid slot.
    //
    // 4-Rec4 / 4-UF2: This is intentional defense-in-depth and duplicates
    // the validation that PromoteReportSpec.validate() performs at the
    // load-time (spec/registry) boundary. The duplication is NOT a
    // redundant check:
    //
    //   - PromoteReportSpec guards the REGISTRY-load path. Every report
    //     that reaches this function via REGISTRY.loadFromFile has already
    //     been validated and its primary_member_index field is sound.
    //
    //   - This applicator-side guard protects the PROGRAMMATIC path: tests
    //     that push a cluster directly onto promoter.report.cross_agent_dedup_clusters
    //     and re-serialize it through fs.writeFileSync (bypassing REGISTRY),
    //     or future in-process callers that construct a cluster object
    //     without going through REGISTRY.saveToFile.
    //
    // Both guards exist because both entry paths are real. The error
    // message is applicator-specific ("regenerate the report")
    // so the operator-legible owner is the applicator; the spec-level
    // message is load-time ("legacy schema v1 detected"). They target
    // different failure modes.
    if (
      !Number.isInteger(cluster.primary_member_index) ||
      cluster.primary_member_index < 0 ||
      cluster.primary_member_index >= cluster.member_items.length
    ) {
      throw new Error(
        `cross_agent_dedup cluster ${decision.cluster_id}: ` +
          `primary_member_index ${cluster.primary_member_index} out of range ` +
          `(member_items.length=${cluster.member_items.length}). ` +
          `This likely means the report was generated by an older Phase A ` +
          `build or constructed programmatically without going through the ` +
          `panel-reviewer selector. Regenerate the report before applying.`,
      );
    }

    // Primary owner: ALWAYS the global file of the primary_owner_agent.
    // Mixed-scope clusters promote the consolidated principle to global
    // regardless of the primary member's origin scope.
    const primaryPath = getGlobalLearningFilePath(
      cluster.primary_owner_agent,
      ctx.ontoHome,
    );
    const clusterMarker = `<!-- cluster_id: ${decision.cluster_id} -->`;

    // SYN-C1: non-primary members are every item EXCEPT the one at
    // primary_member_index. Index-based filter handles same-content
    // duplicates correctly — two members with identical raw_line can
    // occupy different slots, and we only skip the specific slot the
    // panel-reviewer picked.
    const nonPrimaryMembers = cluster.member_items.filter(
      (_, idx) => idx !== cluster.primary_member_index,
    );

    // UF1: cluster marker in the primary file is ONLY evidence of success
    // when every non-primary member also has its own marker. Otherwise the
    // prior attempt crashed after writing the cluster marker but before
    // finishing member marks — we must finish the unfinished work.
    const clusterMarkerPresent =
      fs.existsSync(primaryPath) &&
      fs.readFileSync(primaryPath, "utf8").includes(clusterMarker);

    if (clusterMarkerPresent) {
      // 5-LINEINDEX cleanup: preflight here only classifies whether a
      // member is already_consolidated, still needs marking, or drifted.
      // The actual write re-resolves the anchor INSIDE the lock (below),
      // so the preflight line index would be stale by the time the lock
      // is acquired. Pass-through the member ref; the write path is the
      // single source of truth for the current lineIndex.
      const unmarkedMembers: ParsedLearningItem[] = [];
      for (const member of nonPrimaryMembers) {
        if (!fs.existsSync(member.source_path)) {
          // A previously marked member file that subsequently disappeared —
          // treat as resumable failure so the operator investigates.
          throw new Error(
            `cross_agent_dedup resume: expected member file ${member.source_path} ` +
              `missing for ${member.agent_id}`,
          );
        }
        const memberLines = fs
          .readFileSync(member.source_path, "utf8")
          .split("\n");
        const resolution = resolveDedupMemberAnchor(
          memberLines,
          member,
          decision.cluster_id,
        );
        if (resolution.kind === "already_consolidated") continue;
        if (resolution.kind === "match_original") {
          unmarkedMembers.push(member);
          continue;
        }
        // ambiguous or missing — neither the original nor the expected
        // marker is locatable. Fail-closed.
        throw new Error(
          `cross_agent_dedup resume: member ${member.agent_id} in ` +
            `${member.source_path} is ${resolution.kind} (cluster_id=${decision.cluster_id})`,
        );
      }
      if (unmarkedMembers.length === 0) {
        // Clean idempotent success — cluster AND all members are consolidated.
        ctx.state = markApplied(ctx.state, {
          decision_kind: "cross_agent_dedup",
          decision_id: id,
          applied_at: new Date().toISOString(),
          target_path: primaryPath,
          result_summary: `cluster ${decision.cluster_id} fully consolidated, skipped`,
        });
        ctx.summary.cross_agent_dedup_applied += 1;
        return;
      }
      // Finish the partial apply: mark only the still-original members.
      // SYN-C2: use the resolved lineIndex as the mutation authority.
      // 4-D1(a): wrap each per-file read-modify-write in withFileLock to
      // serialize against concurrent writers. We re-resolve the anchor
      // INSIDE the lock so no window exists between validation and write.
      const date = new Date().toISOString().slice(0, 10);
      let finishedCount = 0;
      for (const member of unmarkedMembers) {
        withFileLock(member.source_path, () => {
          const memberLines = fs
            .readFileSync(member.source_path, "utf8")
            .split("\n");
          const reResolution = resolveDedupMemberAnchor(
            memberLines,
            member,
            decision.cluster_id,
          );
          if (reResolution.kind === "already_consolidated") {
            // Another resumed process finished this one — skip gracefully.
            return;
          }
          if (reResolution.kind !== "match_original") {
            throw new Error(
              `cross_agent_dedup resume: member ${member.agent_id} in ` +
                `${member.source_path} became ${reResolution.kind} ` +
                `inside the lock window (cluster_id=${decision.cluster_id})`,
            );
          }
          const marker = `<!-- consolidated (${date}) into ${decision.cluster_id}: ${member.raw_line} -->`;
          const ok = replaceLineAtIndex(
            member.source_path,
            reResolution.lineIndex!,
            member.raw_line,
            marker,
          );
          if (!ok) {
            throw new Error(
              `cross_agent_dedup resume: replaceLineAtIndex failed under lock ` +
                `for ${member.agent_id} (${member.source_path})`,
            );
          }
          finishedCount += 1;
        });
      }
      ctx.state = markApplied(ctx.state, {
        decision_kind: "cross_agent_dedup",
        decision_id: id,
        applied_at: new Date().toISOString(),
        target_path: primaryPath,
        result_summary:
          `cluster ${decision.cluster_id} resumed; ` +
          `${finishedCount} additional member entries marked to close prior partial apply`,
      });
      ctx.summary.cross_agent_dedup_applied += 1;
      return;
    }

    // No cluster marker — fresh apply. CG2 anchor resolution per member.
    // 5-LINEINDEX: we only classify here (valid target / drifted / ambig /
    // already_marked). The concrete lineIndex is re-resolved inside the
    // locked write below so the preflight index wouldn't be authoritative
    // even if we saved it.
    const preflightFailures: string[] = [];
    const resolvedMembers: ParsedLearningItem[] = [];
    for (const member of nonPrimaryMembers) {
      if (!fs.existsSync(member.source_path)) {
        preflightFailures.push(
          `${member.agent_id} (${member.scope}): file ${member.source_path} does not exist`,
        );
        continue;
      }
      const fileLines = fs
        .readFileSync(member.source_path, "utf8")
        .split("\n");
      const resolution = resolveDedupMemberAnchor(
        fileLines,
        member,
        decision.cluster_id,
      );
      if (resolution.kind === "missing") {
        preflightFailures.push(
          `${member.agent_id} (${member.scope}): raw_line not locatable at line ${member.line_number} or via verbatim scan in ${member.source_path}`,
        );
        continue;
      }
      if (resolution.kind === "ambiguous") {
        preflightFailures.push(
          `${member.agent_id} (${member.scope}): multiple verbatim matches for raw_line in ${member.source_path} and line_number anchor did not resolve`,
        );
        continue;
      }
      if (resolution.kind === "already_consolidated") {
        // SYN-CC1 + 4-D2(a): cluster marker absent but this member IS
        // already marked — the "crash mid-apply after ordering flip"
        // state. Fail-closed by intent; automatic finish would risk data
        // corruption if the partial apply came from a different shortlist
        // composition than the current cluster.
        //
        // Operator-guidance: the error message includes both recovery
        // options with concrete paths/commands so the operator can act
        // without chasing docs:
        //   1. Restore the specific member file from the recoverability
        //      checkpoint at the session-specific manifest path, OR
        //   2. Manually remove the stray consolidated marker from the
        //      member file and re-run apply for this session.
        const sessionId = ctx.state.session_id;
        const checkpointManifestPath = path.join(
          os.homedir(),
          ".onto",
          "backups",
          sessionId,
          "restore-manifest.yaml",
        );
        preflightFailures.push(
          `${member.agent_id} (${member.scope}): already carries consolidated ` +
            `marker for cluster ${decision.cluster_id} in ${member.source_path} ` +
            `despite missing cluster marker in primary file (${primaryPath}). ` +
            `Manual recovery required — SYN-CC1 fail-closed contract. ` +
            `Options: ` +
            `(A) Restore this file from the checkpoint manifest at ` +
            `${checkpointManifestPath} (follow the backup entry whose ` +
            `source_path matches ${member.source_path}); or ` +
            `(B) Manually remove the stray '<!-- consolidated (...) into ` +
            `${decision.cluster_id}: ... -->' line from ${member.source_path} ` +
            `and re-run apply for session ${sessionId}.`,
        );
        continue;
      }
      // match_original — classified valid. Index is re-derived inside
      // the lock window during the write loop.
      resolvedMembers.push(member);
    }
    if (preflightFailures.length > 0) {
      throw new Error(
        `cross_agent_dedup preflight failed for cluster ${decision.cluster_id}: ` +
          preflightFailures.join("; "),
      );
    }

    // Preflight passed — mark each member first, THEN write consolidated
    // line + cluster marker on the primary file. UF1 ordering: cluster
    // marker is the "commit marker" written last. SYN-C2: mutation uses
    // replaceLineAtIndex. 4-D1(a): each read-modify-write cycle runs
    // under a file-level lock so concurrent peers cannot lose updates on
    // unrelated lines of the same file. We re-resolve the anchor INSIDE
    // the lock so there is no TOCTOU window between validation and write.
    const date = new Date().toISOString().slice(0, 10);
    let consolidatedCount = 0;
    for (const member of resolvedMembers) {
      withFileLock(member.source_path, () => {
        const memberLines = fs
          .readFileSync(member.source_path, "utf8")
          .split("\n");
        const reResolution = resolveDedupMemberAnchor(
          memberLines,
          member,
          decision.cluster_id,
        );
        if (reResolution.kind !== "match_original") {
          // 5-OVERCLAIM fix: the prior message said "no member file was
          // left in an inconsistent state", which was false — any earlier
          // members in this cluster that ALREADY succeeded inside this
          // loop are already on disk. We no longer overclaim. Operators
          // use apply-state (promote-execution-result.json) to see which
          // members were marked before this failure and restore from the
          // recoverability checkpoint.
          throw new Error(
            `cross_agent_dedup post-preflight race: ${member.agent_id} ` +
              `(${member.source_path}) became ${reResolution.kind} inside the ` +
              `lock window — another process mutated this member file between ` +
              `preflight and the locked write. ${consolidatedCount} earlier ` +
              `member(s) in this cluster were already marked before this ` +
              `failure; consult apply-state (promote-execution-result.json in ` +
              `the session root) to see the committed subset and use the ` +
              `recoverability checkpoint to restore if needed.`,
          );
        }
        const marker = `<!-- consolidated (${date}) into ${decision.cluster_id}: ${member.raw_line} -->`;
        const ok = replaceLineAtIndex(
          member.source_path,
          reResolution.lineIndex!,
          member.raw_line,
          marker,
        );
        if (!ok) {
          throw new Error(
            `cross_agent_dedup: replaceLineAtIndex failed under lock for ` +
              `${member.agent_id} (${member.source_path})`,
          );
        }
        consolidatedCount += 1;
      });
    }

    // All member marks complete — now write the consolidated line + cluster
    // marker as the commit step. Locked at the primary file level to
    // serialize against peers that may be appending to the same file.
    withFileLock(primaryPath, () => {
      const learningId = hashLine(cluster.consolidated_line);
      appendLearningLine(primaryPath, cluster.consolidated_line, learningId);
      fs.appendFileSync(primaryPath, `${clusterMarker}\n`, "utf8");
    });

    ctx.state = markApplied(ctx.state, {
      decision_kind: "cross_agent_dedup",
      decision_id: id,
      applied_at: new Date().toISOString(),
      target_path: primaryPath,
      result_summary:
        `consolidated to ${path.basename(primaryPath)}; ` +
        `${consolidatedCount} member entries marked (scope-aware, anchor-resolved)`,
    });
    ctx.summary.cross_agent_dedup_applied += 1;
  } catch (error) {
    ctx.state = markFailed(ctx.state, {
      decision_kind: "cross_agent_dedup",
      decision_id: id,
      attempted_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      resumable: true,
    });
    ctx.summary.failed_decisions += 1;
  }
}

// ---------------------------------------------------------------------------
// Domain doc update — DD-19 Phase B
// ---------------------------------------------------------------------------

const DOMAIN_DOC_SYSTEM_PROMPT = `You are updating a domain document with a newly promoted learning.

Output ONE JSON object:
{
  "reflection_form": "add_term" | "modify_definition" | "add_question" | "modify_question" | "add_sub_area" | "modify_scope" | "add_standard",
  "content": "<the markdown block to insert into the document — 1-5 lines, no fences>"
}

Reflection form selection by target document:
  - concepts.md → "add_term" | "modify_definition"
  - competency_qs.md → "add_question" | "modify_question"
  - domain_scope.md → "add_sub_area" | "modify_scope" | "add_standard"

Respond ONLY with valid JSON (no markdown fences).`;

function buildDomainDocUserPrompt(candidate: DomainDocCandidate): string {
  return [
    `Target document: ${candidate.target_doc}`,
    `Domain: ${candidate.domain}`,
    `Originating agent: ${candidate.agent_id}`,
    "",
    "Promoted learning:",
    candidate.candidate_summary,
    "",
    `Generate a JSON object with reflection_form (matching the target doc) and content (the markdown block).`,
  ].join("\n");
}

function getDomainDocPath(
  domain: string,
  targetDoc: DomainDocCandidate["target_doc"],
  ontoHome?: string,
): string {
  const home = ontoHome ?? path.join(os.homedir(), ".onto");
  return path.join(home, "domains", domain, targetDoc);
}

interface DomainDocLlmResult {
  reflection_form: string;
  content: string;
  llm_model_id: string;
}

/**
 * Allowed reflection_form values per target document. m-4 fix: previously
 * the LLM could return any string and the applicator would accept it; now
 * the value is validated against the per-target allow-list. The mapping
 * mirrors the prompt at DOMAIN_DOC_SYSTEM_PROMPT line ~635.
 */
const VALID_REFLECTION_FORMS: Readonly<
  Record<DomainDocCandidate["target_doc"], readonly string[]>
> = {
  "concepts.md": ["add_term", "modify_definition"],
  "competency_qs.md": ["add_question", "modify_question"],
  "domain_scope.md": ["add_sub_area", "modify_scope", "add_standard"],
};

async function callDomainDocLlm(
  candidate: DomainDocCandidate,
  modelId?: string,
): Promise<DomainDocLlmResult> {
  const userPrompt = buildDomainDocUserPrompt(candidate);
  const result = await callLlm(DOMAIN_DOC_SYSTEM_PROMPT, userPrompt, {
    max_tokens: 1024,
    ...(modelId ? { model_id: modelId } : {}),
  });

  let cleaned = result.text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  }
  const parsed = JSON.parse(cleaned) as {
    reflection_form?: unknown;
    content?: unknown;
  };
  if (
    typeof parsed.reflection_form !== "string" ||
    typeof parsed.content !== "string" ||
    parsed.content.length === 0
  ) {
    throw new Error(
      `domain doc LLM returned invalid shape: reflection_form=${typeof parsed.reflection_form}, content=${typeof parsed.content}`,
    );
  }
  // m-4 enum validation: reflection_form must be in the per-target allow-list.
  const allowed = VALID_REFLECTION_FORMS[candidate.target_doc];
  if (!allowed.includes(parsed.reflection_form)) {
    throw new Error(
      `domain doc LLM returned invalid reflection_form "${parsed.reflection_form}" ` +
        `for target ${candidate.target_doc}. Allowed: ${allowed.join(", ")}`,
    );
  }
  return {
    reflection_form: parsed.reflection_form,
    content: parsed.content,
    llm_model_id: result.model_id,
  };
}

/**
 * Apply an approved domain doc update.
 *
 * Phase B contract:
 *   1. Look up the approved DomainDocCandidate (by slot_id + instance_id).
 *      Lookup happens in the caller; this function receives the candidate.
 *   2. Call the LLM to generate reflection_form + content.
 *   3. Append the content under a generated heading at
 *      `~/.onto/domains/{domain}/{target_doc}` (creating the file if absent).
 *
 * The slot_id is included in a comment so subsequent runs can detect that
 * this slot has already been written and skip duplicate insertions. We
 * intentionally append rather than replace because domain docs grow
 * incrementally and overwrite would lose prior content.
 */
async function applyDomainDocUpdate(
  candidate: DomainDocCandidate,
  ctx: ApplyContext,
  modelId?: string,
): Promise<void> {
  const id = decisionId(
    "domain_doc_update",
    `${candidate.slot_id}|${candidate.instance_id}`,
  );
  try {
    const docPath = getDomainDocPath(
      candidate.domain,
      candidate.target_doc,
      ctx.ontoHome,
    );

    // Skip if this slot was already written by an earlier attempt.
    if (fs.existsSync(docPath)) {
      const existing = fs.readFileSync(docPath, "utf8");
      if (existing.includes(`<!-- slot_id: ${candidate.slot_id} -->`)) {
        ctx.state = markApplied(ctx.state, {
          decision_kind: "domain_doc_update",
          decision_id: id,
          applied_at: new Date().toISOString(),
          target_path: docPath,
          result_summary: `slot ${candidate.slot_id} already present, skipped`,
        });
        ctx.summary.domain_doc_updates_applied += 1;
        return;
      }
    }

    const llmResult = await callDomainDocLlm(candidate, modelId);

    // Build the appended block. Each entry is wrapped in slot/instance
    // markers so future regeneration can detect it.
    const date = new Date().toISOString().slice(0, 10);
    const block = [
      "",
      `<!-- slot_id: ${candidate.slot_id} -->`,
      `<!-- instance_id: ${candidate.instance_id} -->`,
      `<!-- reflection_form: ${llmResult.reflection_form} | source_promotion: ${candidate.approved_promotion_id} | added: ${date} -->`,
      llmResult.content.trim(),
      "",
    ].join("\n");

    fs.mkdirSync(path.dirname(docPath), { recursive: true });
    if (!fs.existsSync(docPath)) {
      fs.writeFileSync(
        docPath,
        `# ${candidate.target_doc.replace(".md", "")} — ${candidate.domain}\n`,
        "utf8",
      );
    }
    fs.appendFileSync(docPath, block, "utf8");

    ctx.state = markApplied(ctx.state, {
      decision_kind: "domain_doc_update",
      decision_id: id,
      applied_at: new Date().toISOString(),
      target_path: docPath,
      result_summary:
        `appended ${llmResult.reflection_form} block to ${candidate.target_doc} (model=${llmResult.llm_model_id})`,
    });
    ctx.summary.domain_doc_updates_applied += 1;
  } catch (error) {
    ctx.state = markFailed(ctx.state, {
      decision_kind: "domain_doc_update",
      decision_id: id,
      attempted_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      // LLM call failures are resumable (network blip), but JSON parse
      // failures are not (the model can't generate valid JSON for this
      // candidate without prompt changes). We mark as resumable so the
      // operator can re-run; the next attempt may use a different model.
      resumable: true,
    });
    ctx.summary.failed_decisions += 1;
  }
}

function applyObligationWaive(
  obligationId: string,
  reason: string,
  ctx: ApplyContext,
  auditState: AuditState,
  sessionId: string,
): void {
  const id = decisionId("obligation_waive", obligationId);
  try {
    const ob = findObligation(auditState, obligationId);
    if (!ob) throw new Error(`obligation ${obligationId} not found`);
    ob.transition("waived", reason, { session_id: sessionId });
    ctx.state = markApplied(ctx.state, {
      decision_kind: "obligation_waive",
      decision_id: id,
      applied_at: new Date().toISOString(),
      target_path: "audit-state.yaml",
      result_summary: `waived obligation ${obligationId}`,
    });
    ctx.summary.obligations_waived += 1;
  } catch (error) {
    ctx.state = markFailed(ctx.state, {
      decision_kind: "obligation_waive",
      decision_id: id,
      attempted_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
      resumable: false,
    });
    ctx.summary.failed_decisions += 1;
  }
}

function hashLine(line: string): string {
  // Mirror Phase 2 generateLearningId pattern: 12-char sha256 prefix.
  return crypto.createHash("sha256").update(line).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// Pending decision enumeration
// ---------------------------------------------------------------------------

function enumeratePendingDecisions(
  decisions: PromoteDecisions,
): PendingDecisionRef[] {
  const refs: PendingDecisionRef[] = [];

  for (const d of decisions.promotions) {
    if (!d.approve) continue;
    refs.push({
      decision_kind: "promotion",
      decision_id: decisionId(
        "promotion",
        `${d.candidate_agent_id}|${d.candidate_line}`,
      ),
    });
  }
  for (const d of decisions.contradiction_replacements) {
    if (!d.approve) continue;
    refs.push({
      decision_kind: "contradiction_replacement",
      decision_id: decisionId(
        "contradiction_replacement",
        `${d.agent_id}|${d.existing_line}`,
      ),
    });
  }
  for (const d of decisions.axis_tag_changes) {
    if (!d.approve) continue;
    refs.push({
      decision_kind: "axis_tag_change",
      decision_id: decisionId("axis_tag_change", `${d.agent_id}|${d.original_line}`),
    });
  }
  for (const d of decisions.retirements) {
    refs.push({
      decision_kind: "retirement",
      decision_id: decisionId("retirement", `${d.agent_id}|${d.line_excerpt}`),
    });
  }
  for (const d of decisions.audit_outcomes) {
    refs.push({
      decision_kind: "audit_outcome",
      decision_id: decisionId("audit_outcome", `${d.agent_id}|${d.line_excerpt}`),
    });
  }
  for (const d of decisions.audit_obligations_waived) {
    refs.push({
      decision_kind: "obligation_waive",
      decision_id: decisionId("obligation_waive", d.obligation_id),
    });
  }
  for (const d of decisions.cross_agent_dedup_approvals) {
    if (!d.approve) continue;
    refs.push({
      decision_kind: "cross_agent_dedup",
      decision_id: decisionId("cross_agent_dedup", d.cluster_id),
    });
  }
  for (const d of decisions.domain_doc_updates) {
    if (!d.approve) continue;
    refs.push({
      decision_kind: "domain_doc_update",
      decision_id: decisionId(
        "domain_doc_update",
        `${d.slot_id}|${d.instance_id}`,
      ),
    });
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runPromoteExecutor(
  config: RunPromoteExecutorConfig,
): Promise<RunPromoteExecutorOutcome> {
  const sessionRoot = resolveSessionRoot(config);
  const auditStatePath = resolveAuditStatePath(config);

  // -------------------------------------------------------------------------
  // Step 1: Load report + decisions
  // -------------------------------------------------------------------------
  const reportPath = path.join(sessionRoot, "promote-report.json");
  const decisionsPath = path.join(sessionRoot, "promote-decisions.json");

  const report = REGISTRY.loadFromFile<PromoteReport>(
    "promote_report",
    reportPath,
  );
  const decisions = REGISTRY.loadFromFile<PromoteDecisions>(
    "promote_decisions",
    decisionsPath,
  );

  // -------------------------------------------------------------------------
  // Step 2: Baseline freshness check (DD-10)
  // -------------------------------------------------------------------------
  const mismatches = verifyBaselineHash(report.collection.baseline_hash);
  if (mismatches.length > 0 && !config.forceStale) {
    return {
      kind: "stale_baseline",
      mismatches,
      message:
        `Baseline hash check failed for ${mismatches.length} file(s). ` +
        `Regenerate the report or pass --force-stale ` +
        `to proceed (UNSAFE: source files have shifted since Phase A).`,
    };
  }

  // -------------------------------------------------------------------------
  // Step 3: Recovery context (only on --resume)
  // -------------------------------------------------------------------------
  let priorState: ApplyExecutionState | null = null;
  if (config.resume) {
    const context = await gatherRecoveryContext(
      config.sessionId,
      config.projectRoot,
    );
    const truth = resolveRecoveryTruth(
      context,
      config.projectRoot,
      config.recoveryPolicy,
    );

    if (truth.kind === "manual_escalation_required") {
      return {
        kind: "manual_escalation_required",
        message: buildEscalationMessage(truth),
      };
    }
    if (truth.kind === "resolved" && truth.latest_source.kind === "apply_state") {
      priorState = truth.latest_source.state;
    }
    if (truth.kind === "no_recovery_data") {
      // Nothing to resume from. Treat as fresh attempt.
      priorState = null;
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Pending decision enumeration
  // -------------------------------------------------------------------------
  const pendingDecisions = enumeratePendingDecisions(decisions);
  if (pendingDecisions.length === 0) {
    return {
      kind: "no_decisions",
      message:
        "promote-decisions.json contains no approved decisions. Nothing to apply.",
    };
  }

  // -------------------------------------------------------------------------
  // Step 5: Recoverability checkpoint (DD-16)
  // -------------------------------------------------------------------------
  const attemptId = priorState?.attempt_id ?? generateUlid();
  const generation = priorState?.generation ?? 0;

  let checkpointPath: string | null = null;
  if (!config.dryRun) {
    // U3 fix: forward ontoHome / auditStatePath overrides into checkpoint
    // creation so backup scope tracks actual mutation scope.
    const checkpointOverride: {
      ontoHome?: string;
      auditStatePath?: string;
    } = {};
    if (config.ontoHome !== undefined) {
      checkpointOverride.ontoHome = config.ontoHome;
    }
    if (config.auditStatePath !== undefined) {
      checkpointOverride.auditStatePath = config.auditStatePath;
    }
    const prep = await createRecoverabilityCheckpoint(
      config.sessionId,
      config.projectRoot,
      attemptId,
      generation,
      checkpointOverride,
    );
    if (prep.kind === "created" && prep.checkpoint) {
      checkpointPath = prep.checkpoint.manifest_path;
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Initialize / restore ApplyExecutionState
  // -------------------------------------------------------------------------
  let state =
    priorState ??
    initApplyState({
      sessionId: config.sessionId,
      attemptId,
      pendingDecisions,
      recoverabilityCheckpointPath: checkpointPath,
    });

  // Resume edge case: prior state may have already-applied decisions. Filter
  // pending list against applied/failed so we don't double-apply.
  if (priorState) {
    const alreadyHandled = new Set([
      ...priorState.applied_decisions.map(
        (d) => `${d.decision_kind}:${d.decision_id}`,
      ),
      ...priorState.failed_decisions.map(
        (d) => `${d.decision_kind}:${d.decision_id}`,
      ),
    ]);
    state = {
      ...state,
      pending_decisions: pendingDecisions.filter(
        (p) => !alreadyHandled.has(`${p.decision_kind}:${p.decision_id}`),
      ),
    };
  }

  if (config.dryRun) {
    return {
      kind: "completed",
      state,
      statePath: path.join(sessionRoot, "promote-execution-result.json"),
      summary: emptySummary(),
    };
  }

  // -------------------------------------------------------------------------
  // Step 7: Apply approved decisions (each one persists state)
  //
  // B-A fix: build a Set of pending decision keys (decision_kind:decision_id)
  // and filter every decision from the input arrays through it before
  // applying. This guards the resume path: previously, the apply loop
  // iterated `decisions.X` directly, so already-applied decisions would
  // re-mutate files and then crash markApplied with "not found in pending".
  // -------------------------------------------------------------------------
  const auditState = loadAuditState(auditStatePath);
  const summary: ExecutionSummary = emptySummary();
  const ctx: ApplyContext = {
    projectRoot: config.projectRoot,
    state,
    sessionRoot,
    summary,
    ...(config.ontoHome !== undefined ? { ontoHome: config.ontoHome } : {}),
  };

  // Snapshot the pending key set BEFORE the loop. The set is captured once;
  // we don't recompute from ctx.state.pending_decisions on each iteration
  // because each markApplied removes the key, which would cause subsequent
  // pending checks to skip everything.
  const pendingKeys = new Set(
    state.pending_decisions.map((p) => `${p.decision_kind}:${p.decision_id}`),
  );
  const isPending = (kind: AppliedDecision["decision_kind"], id: string): boolean =>
    pendingKeys.has(`${kind}:${id}`);

  // Helper that wraps each per-decision step. It checks pending membership,
  // calls the applicator, then persists state. Persistence failures are
  // routed through writeEmergencyLogEntry (B-B fix) so applied side effects
  // never go un-recorded.
  const applyAndPersist = async (
    kind: AppliedDecision["decision_kind"],
    decisionId: string,
    apply: () => void | Promise<void>,
  ): Promise<void> => {
    if (!isPending(kind, decisionId)) {
      // Already applied (resume case) — skip without re-mutating.
      return;
    }
    await apply();
    try {
      persistApplyState(sessionRoot, ctx.state);
    } catch (persistError) {
      // B-B fix: persistence failure path. Write an emergency-log entry so
      // the side effects don't go un-recorded, then re-throw to abort the
      // loop. The catastrophic catch below will surface this as
      // failed_resumable to the caller.
      writeEmergencyLogEntry({
        sessionId: config.sessionId,
        sessionRoot,
        attemptId: ctx.state.attempt_id,
        generation: ctx.state.generation,
        fatalErrorKind: "state_persistence_failed",
        fatalErrorMessage:
          persistError instanceof Error
            ? persistError.message
            : String(persistError),
        snapshot: ctx.state,
      });
      throw persistError;
    }
  };

  try {
    for (const d of decisions.promotions) {
      const id = decisionIdFor("promotion", `${d.candidate_agent_id}|${d.candidate_line}`);
      await applyAndPersist("promotion", id, () => applyPromotion(d, ctx));
    }
    for (const d of decisions.contradiction_replacements) {
      const id = decisionIdFor(
        "contradiction_replacement",
        `${d.agent_id}|${d.existing_line}`,
      );
      await applyAndPersist("contradiction_replacement", id, () =>
        applyContradictionReplacement(d, ctx),
      );
    }
    for (const d of decisions.axis_tag_changes) {
      const id = decisionIdFor("axis_tag_change", `${d.agent_id}|${d.original_line}`);
      await applyAndPersist("axis_tag_change", id, () => applyAxisTagChange(d, ctx));
    }
    for (const d of decisions.retirements) {
      const id = decisionIdFor("retirement", `${d.agent_id}|${d.line_excerpt}`);
      await applyAndPersist("retirement", id, () =>
        applyRetirement(d, ctx, auditState),
      );
    }
    for (const d of decisions.audit_outcomes) {
      const id = decisionIdFor("audit_outcome", `${d.agent_id}|${d.line_excerpt}`);
      await applyAndPersist("audit_outcome", id, () => applyAuditOutcome(d, ctx));
    }
    for (const d of decisions.audit_obligations_waived) {
      const id = decisionIdFor("obligation_waive", d.obligation_id);
      // M-B fix: save audit-state IMMEDIATELY after each successful waive so
      // a mid-loop crash doesn't leave apply-state ahead of the canonical
      // ledger. Previously the audit-state save was deferred to the end of
      // the loop.
      await applyAndPersist("obligation_waive", id, () => {
        applyObligationWaive(
          d.obligation_id,
          d.reason,
          ctx,
          auditState,
          config.sessionId,
        );
      });
      // Save audit-state right after the per-step persistence. We do it
      // here (not inside applyAndPersist) because only obligation_waive
      // mutates audit-state.
      try {
        saveAuditState(auditState, auditStatePath);
      } catch (auditPersistError) {
        writeEmergencyLogEntry({
          sessionId: config.sessionId,
          sessionRoot,
          attemptId: ctx.state.attempt_id,
          generation: ctx.state.generation,
          fatalErrorKind: "state_persistence_failed",
          fatalErrorMessage:
            "audit-state save after obligation_waive failed: " +
            (auditPersistError instanceof Error
              ? auditPersistError.message
              : String(auditPersistError)),
          snapshot: ctx.state,
        });
        throw auditPersistError;
      }
    }

    // Cross-agent dedup: look up the cluster from the report by cluster_id.
    const clusterById = new Map(
      report.cross_agent_dedup_clusters.map((c) => [c.cluster_id, c]),
    );
    for (const d of decisions.cross_agent_dedup_approvals) {
      if (!d.approve) continue;
      const id = decisionIdFor("cross_agent_dedup", d.cluster_id);
      if (!isPending("cross_agent_dedup", id)) continue;

      const cluster = clusterById.get(d.cluster_id);
      if (!cluster) {
        ctx.state = markFailed(ctx.state, {
          decision_kind: "cross_agent_dedup",
          decision_id: id,
          attempted_at: new Date().toISOString(),
          error_message: `cluster_id ${d.cluster_id} not in report.cross_agent_dedup_clusters`,
          resumable: false,
        });
        ctx.summary.failed_decisions += 1;
        persistApplyState(sessionRoot, ctx.state);
        continue;
      }
      applyCrossAgentDedup(d, cluster, ctx);
      try {
        persistApplyState(sessionRoot, ctx.state);
      } catch (persistError) {
        writeEmergencyLogEntry({
          sessionId: config.sessionId,
          sessionRoot,
          attemptId: ctx.state.attempt_id,
          generation: ctx.state.generation,
          fatalErrorKind: "state_persistence_failed",
          fatalErrorMessage:
            persistError instanceof Error
              ? persistError.message
              : String(persistError),
          snapshot: ctx.state,
        });
        throw persistError;
      }
    }

    // Domain doc updates: look up the candidate from the report by slot_id +
    // instance_id, then call the LLM to generate the content.
    const candidateBySlotInstance = new Map(
      report.domain_doc_candidates.map((c) => [
        `${c.slot_id}|${c.instance_id}`,
        c,
      ]),
    );
    for (const d of decisions.domain_doc_updates) {
      if (!d.approve) continue;
      const id = decisionIdFor("domain_doc_update", `${d.slot_id}|${d.instance_id}`);
      if (!isPending("domain_doc_update", id)) continue;

      const candidate = candidateBySlotInstance.get(
        `${d.slot_id}|${d.instance_id}`,
      );
      if (!candidate) {
        ctx.state = markFailed(ctx.state, {
          decision_kind: "domain_doc_update",
          decision_id: id,
          attempted_at: new Date().toISOString(),
          error_message: `domain doc candidate ${d.slot_id}|${d.instance_id} not in report.domain_doc_candidates`,
          resumable: false,
        });
        ctx.summary.failed_decisions += 1;
        persistApplyState(sessionRoot, ctx.state);
        continue;
      }
      await applyDomainDocUpdate(candidate, ctx, config.modelId);
      try {
        persistApplyState(sessionRoot, ctx.state);
      } catch (persistError) {
        writeEmergencyLogEntry({
          sessionId: config.sessionId,
          sessionRoot,
          attemptId: ctx.state.attempt_id,
          generation: ctx.state.generation,
          fatalErrorKind: "state_persistence_failed",
          fatalErrorMessage:
            persistError instanceof Error
              ? persistError.message
              : String(persistError),
          snapshot: ctx.state,
        });
        throw persistError;
      }
    }
  } catch (error) {
    // Catastrophic mid-loop failure (e.g., file system error). Mark state as
    // failed_resumable and persist before propagating.
    ctx.state = transitionStatus(ctx.state, "failed_resumable");
    const statePath = persistApplyState(sessionRoot, ctx.state);
    return {
      kind: "failed_resumable",
      state: ctx.state,
      statePath,
      summary,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  // M-B fix: audit-state is now saved per-step inside the obligation_waive
  // applicator above (immediately after each successful waive), so a
  // mid-loop crash leaves apply-state and audit-state consistent. The
  // trailing save here would be redundant.

  // -------------------------------------------------------------------------
  // Step 8: Determine final status
  // -------------------------------------------------------------------------
  const finalStatus = summary.failed_decisions > 0 ? "failed_resumable" : "completed";
  ctx.state = transitionStatus(ctx.state, finalStatus);
  const statePath = persistApplyState(sessionRoot, ctx.state);

  if (finalStatus === "failed_resumable") {
    return {
      kind: "failed_resumable",
      state: ctx.state,
      statePath,
      summary,
      reason: `${summary.failed_decisions} decision(s) failed during apply`,
    };
  }

  return {
    kind: "completed",
    state: ctx.state,
    statePath,
    summary,
  };
}

function emptySummary(): ExecutionSummary {
  return {
    promotions_applied: 0,
    contradiction_replacements_applied: 0,
    axis_tag_changes_applied: 0,
    retirements_applied: 0,
    audit_outcomes_applied: 0,
    obligations_waived: 0,
    cross_agent_dedup_applied: 0,
    domain_doc_updates_applied: 0,
    failed_decisions: 0,
  };
}

// loadApplyState exported for adapters needing to inspect state without
// running the executor.
export { loadApplyState };

// Test-only exports. Kept minimal (6-SYN-D2) — only primitives directly
// exercised by tests are exposed. Additional helpers (isPidAlive,
// readLockHolderPid, replaceLineAtIndex) are covered indirectly via the
// withFileLock and applyCrossAgentDedup paths. Production code MUST NOT
// import __testExports.
export const __testExports = {
  withFileLock,
};
