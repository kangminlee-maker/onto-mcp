import { describe, expect, it } from "vitest";
import {
  assertHostOrchestratedSession,
  assertRuntimeOrchestratedSession,
  resolveOrchestrationOwner,
} from "./orchestration-owner.js";

describe("resolveOrchestrationOwner", () => {
  it("defaults an unstamped session to runtime (backward compatible)", () => {
    expect(resolveOrchestrationOwner(undefined)).toBe("runtime");
    expect(resolveOrchestrationOwner("host")).toBe("host");
    expect(resolveOrchestrationOwner("runtime")).toBe("runtime");
  });
});

describe("assertHostOrchestratedSession (B gate)", () => {
  it("allows a host-orchestrated session", () => {
    expect(() => assertHostOrchestratedSession("host")).not.toThrow();
  });

  it("rejects a runtime session and an unstamped (default-runtime) session", () => {
    expect(() => assertHostOrchestratedSession("runtime")).toThrow(
      /requires a host-orchestrated session/,
    );
    expect(() => assertHostOrchestratedSession(undefined)).toThrow(
      /requires a host-orchestrated session/,
    );
  });
});

describe("assertRuntimeOrchestratedSession (A gate)", () => {
  it("allows a runtime session and an unstamped (default-runtime) session", () => {
    expect(() => assertRuntimeOrchestratedSession("runtime")).not.toThrow();
    expect(() => assertRuntimeOrchestratedSession(undefined)).not.toThrow();
  });

  it("rejects a host-orchestrated session (onto must not spawn its units)", () => {
    expect(() => assertRuntimeOrchestratedSession("host")).toThrow(
      /onto cannot execute review units/,
    );
  });
});
