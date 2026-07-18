import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { awaitChildExit } from "./child-process-exit.js";

/**
 * Real-process tests: the wedge this module exists for is only observable
 * with actual stdio pipe inheritance, so the reproduction spawns real bash
 * children (no mocks). The orphan case is the falsifiable core — a
 * close-only wait would hang until the orphan exits.
 */

const spawnBash = (script: string) =>
  spawn("bash", ["-c", script], { stdio: ["ignore", "pipe", "pipe"] });

describe("awaitChildExit — dead-child-open-stream wedge", () => {
  it("resolves within the grace window when an orphan holds the pipes open", async () => {
    // The background `sleep 5` inherits stdout/stderr; after `exit 7` the
    // child is dead but `close` cannot fire until the orphan ends. A
    // close-only wait resolves after ~5s; the exit+grace wait must resolve
    // in ~graceMs.
    const child = spawnBash("sleep 5 & exit 7");
    const startedAt = Date.now();
    const code = await awaitChildExit(child, { streamCloseGraceMs: 300 });
    const elapsed = Date.now() - startedAt;
    expect(code).toBe(7);
    expect(elapsed).toBeLessThan(3_000); // close-only would take ~5000ms
    // Settle-and-leak guard: our pipe ends must be released at settlement,
    // not pinned until the orphan dies (fd/listener accumulation in
    // long-lived host processes).
    expect(child.stdout!.destroyed).toBe(true);
    expect(child.stderr!.destroyed).toBe(true);
  });

  it("resolves via close on a normal child (no grace delay in the happy path)", async () => {
    const child = spawnBash("echo hi; exit 3");
    const code = await awaitChildExit(child, { streamCloseGraceMs: 5_000 });
    expect(code).toBe(3);
  });

  it("normalizes a signal kill (null code) to a non-zero exit", async () => {
    const child = spawnBash("sleep 30");
    const pending = awaitChildExit(child, { streamCloseGraceMs: 300 });
    child.kill("SIGKILL");
    expect(await pending).toBe(1);
  });

  it("rejects spawn errors through the site-specific mapper", async () => {
    const child = spawn("/no/such/binary-xyz", [], { stdio: "ignore" });
    await expect(
      awaitChildExit(child, {
        mapError: (err) => new Error(`mapped: ${err.code}`),
      }),
    ).rejects.toThrow("mapped: ENOENT");
  });

  it("runs onSettled exactly once (settle seat for the caller's timers)", async () => {
    let calls = 0;
    const child = spawnBash("sleep 5 & exit 0");
    await awaitChildExit(child, {
      streamCloseGraceMs: 200,
      onSettled: () => {
        calls += 1;
      },
    });
    // Let the orphan's eventual close event arrive after settlement.
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(1);
  });
});
