import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeDefer } from "./defer.js";
import { executeClose } from "./close.js";
import { createScope } from "../../scope-runtime/scope-manager.js";
import { appendScopeEvent } from "../../scope-runtime/event-pipeline.js";
import { readEvents } from "../../scope-runtime/event-store.js";
import { reduce } from "../../scope-runtime/reducer.js";
import { handleEvolveCli } from "../cli.js";

let tmpDir: string;

beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "sprint-defer-")); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

/** Set up a scope through validated state so terminal-state tests can close it. */
function setupValidated(scopeId: string) {
  const paths = createScope(tmpDir, scopeId);
  appendScopeEvent(paths, { type: "scope.created", actor: "user", payload: { title: "Test", description: "d", entry_mode: "experience" } });
  appendScopeEvent(paths, { type: "grounding.started", actor: "system", payload: { sources: [{ type: "add-dir", path_or_url: "/test" }] } });
  appendScopeEvent(paths, { type: "grounding.completed", actor: "system", payload: { snapshot_revision: 1, source_hashes: { "add-dir:/test": "h1" }, perspective_summary: { experience: 1, code: 1, policy: 1 } } });
  appendScopeEvent(paths, { type: "align.proposed", actor: "system", payload: { packet_path: "build/align-packet.md", packet_hash: "h", snapshot_revision: 1 } });
  appendScopeEvent(paths, { type: "align.locked", actor: "user", payload: { locked_direction: "test", locked_scope_boundaries: { in: ["a"], out: ["b"] }, locked_in_out: true } });
  appendScopeEvent(paths, { type: "surface.generated", actor: "system", payload: { surface_type: "experience", surface_path: "surface/preview/", content_hash: "sf1", based_on_snapshot: 1 } });
  appendScopeEvent(paths, { type: "surface.confirmed", actor: "user", payload: { final_surface_path: "surface/preview/", final_content_hash: "sf1", total_revisions: 0 } });
  appendScopeEvent(paths, { type: "constraint.discovered", actor: "system", payload: { constraint_id: "CST-001", perspective: "code", summary: "c", severity: "required", discovery_stage: "draft_phase2", decision_owner: "product_owner", impact_if_ignored: "f", source_refs: [{ source: "t", detail: "d" }] } });
  appendScopeEvent(paths, { type: "constraint.decision_recorded", actor: "user", payload: { constraint_id: "CST-001", decision: "inject", selected_option: "fix", decision_owner: "product_owner", rationale: "r" } });
  appendScopeEvent(paths, { type: "target.locked", actor: "system", payload: { surface_hash: "sf1", constraint_decisions: [{ constraint_id: "CST-001", decision: "inject" }] } });
  appendScopeEvent(paths, { type: "compile.started", actor: "system", payload: { snapshot_revision: 1, surface_hash: "sf1" } });
  appendScopeEvent(paths, { type: "compile.completed", actor: "system", payload: { build_spec_path: "build/build-spec.md", build_spec_hash: "bs1", brownfield_detail_path: "build/brownfield-detail.md", brownfield_detail_hash: "bf1", delta_set_path: "build/delta-set.json", delta_set_hash: "ds1", validation_plan_path: "build/validation-plan.md", validation_plan_hash: "vp1" } });
  appendScopeEvent(paths, { type: "apply.started", actor: "agent", payload: { build_spec_hash: "bs1" } });
  appendScopeEvent(paths, { type: "apply.completed", actor: "agent", payload: { result: "success" } });
  appendScopeEvent(paths, { type: "validation.started", actor: "agent", payload: { validation_plan_hash: "vp1" } });
  appendScopeEvent(paths, { type: "validation.completed", actor: "agent", payload: { result: "pass", pass_count: 1, fail_count: 0, items: [{ val_id: "VAL-001", related_cst: "CST-001", result: "pass", detail: "확인 완료" }] } });
  return paths;
}

describe("executeDefer", () => {
  it("defers from any non-terminal state", () => {
    const paths = createScope(tmpDir, "SC-DEFER-001");
    appendScopeEvent(paths, { type: "scope.created", actor: "user", payload: { title: "T", description: "d", entry_mode: "experience" } });

    const result = executeDefer(paths, "방향 재정립 필요", "다음 분기 재개");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.nextState).toBe("deferred");

    const state = reduce(readEvents(paths.events));
    expect(state.current_state).toBe("deferred");
  });

  it("fails from terminal state (closed)", () => {
    const paths = setupValidated("SC-DEFER-002");
    executeClose(paths); // → closed

    const result = executeDefer(paths, "test", "test");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toContain("closed");
  });

  it("fails when already deferred", () => {
    const paths = createScope(tmpDir, "SC-DEFER-003");
    appendScopeEvent(paths, { type: "scope.created", actor: "user", payload: { title: "T", description: "d", entry_mode: "experience" } });
    executeDefer(paths, "first", "cond");

    const result = executeDefer(paths, "second", "cond");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toContain("deferred");
  });
});

describe("evolve defer runtime adapter", () => {
  let logs: string[];
  let errors: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    errors = [];
    logSpy = vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
    errorSpy = vi.spyOn(console, "error").mockImplementation((msg: unknown) => {
      errors.push(String(msg));
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("routes defer subcommand to executeDefer and succeeds", async () => {
    const scopesDir = join(tmpDir, "scopes");
    const paths = createScope(scopesDir, "SC-CLI-DEFER-001");
    appendScopeEvent(paths, { type: "scope.created", actor: "user", payload: { title: "T", description: "d", entry_mode: "experience" } });

    const code = await handleEvolveCli(tmpDir, [
      "defer",
      "--scope-id", "SC-CLI-DEFER-001",
      "--scopes-dir", scopesDir,
      "--reason", "방향 재정립",
      "--resume-condition", "다음 분기",
    ]);

    expect(code).toBe(0);
    const state = reduce(readEvents(paths.events));
    expect(state.current_state).toBe("deferred");

    const output = logs.join("\n");
    expect(output).toContain("\"success\": true");
    expect(output).toContain("\"nextState\": \"deferred\"");
  });

  it("rejects defer when --reason missing", async () => {
    const scopesDir = join(tmpDir, "scopes");
    createScope(scopesDir, "SC-CLI-DEFER-002");

    const code = await handleEvolveCli(tmpDir, [
      "defer",
      "--scope-id", "SC-CLI-DEFER-002",
      "--scopes-dir", scopesDir,
      "--resume-condition", "cond",
    ]);

    expect(code).toBe(1);
    expect(errors.some(e => e.includes("--reason") && e.includes("--resume-condition"))).toBe(true);
  });

  it("rejects defer when --scope-id missing", async () => {
    const code = await handleEvolveCli(tmpDir, [
      "defer",
      "--reason", "r",
      "--resume-condition", "c",
    ]);
    expect(code).toBe(1);
    expect(errors.some(e => e.includes("--scope-id"))).toBe(true);
  });

  it("lists defer in --help output", async () => {
    const code = await handleEvolveCli(tmpDir, ["--help"]);
    expect(code).toBe(0);
    const output = logs.join("\n");
    expect(output).toContain("defer --scope-id");
    expect(output).toContain("--reason");
    expect(output).toContain("--resume-condition");
  });
});
