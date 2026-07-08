import { describe, expect, it } from "vitest";

import { parseClaudeAuthLoggedIn } from "./host-detection.js";

describe("parseClaudeAuthLoggedIn", () => {
  it("returns true for loggedIn:true", () => {
    expect(parseClaudeAuthLoggedIn('{"loggedIn":true}')).toBe(true);
  });

  it("returns true for the real `claude auth status` shape", () => {
    const real = JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      apiProvider: "firstParty",
      subscriptionType: "max",
    });
    expect(parseClaudeAuthLoggedIn(real)).toBe(true);
  });

  it("returns false for loggedIn:false", () => {
    expect(parseClaudeAuthLoggedIn('{"loggedIn":false}')).toBe(false);
  });

  it("returns null when loggedIn is absent (older CLI / other shape)", () => {
    expect(parseClaudeAuthLoggedIn('{"status":"ok"}')).toBeNull();
  });

  it("returns null for a non-boolean loggedIn", () => {
    expect(parseClaudeAuthLoggedIn('{"loggedIn":"yes"}')).toBeNull();
  });

  it("returns null for non-JSON error text", () => {
    expect(parseClaudeAuthLoggedIn("Not logged in. Run `claude auth login`.")).toBeNull();
  });

  it("returns null for empty output", () => {
    expect(parseClaudeAuthLoggedIn("")).toBeNull();
  });
});
