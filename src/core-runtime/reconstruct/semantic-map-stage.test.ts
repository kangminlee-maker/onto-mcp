import { describe, expect, it } from "vitest";
import { resolveSemanticMapCapability, type ReconstructDirectiveAuthor } from "./run.js";
import type {
  SemanticBoundaryVerification,
  SemanticSynthesisOutput,
} from "./comprehension-semantic-map.js";

// W1 (wiring design 20260702 §15.2/§15.3): the semantic-map author capability PAIR rule.
// Production enforcement starts when the W2 semantic_map stage entry calls the resolver; W1 fixes
// the resolver's executable contract here (the fail-loud one-sided pair is the negative-control pair).

type CapabilitySeat = Pick<
  ReconstructDirectiveAuthor,
  "synthesizeSemanticMapNode" | "verifySemanticMapBoundary"
>;

const synthesize = async (): Promise<SemanticSynthesisOutput> => ({
  semantic_summary: "s",
  boundaries: [],
});
const verify = async (): Promise<SemanticBoundaryVerification> => "adversarial_confirmed";

describe("resolveSemanticMapCapability (W1 pair rule)", () => {
  it("both present → 'present'", () => {
    const author: CapabilitySeat = {
      synthesizeSemanticMapNode: synthesize,
      verifySemanticMapBoundary: verify,
    };
    expect(resolveSemanticMapCapability(author)).toBe("present");
  });

  it("both absent → 'absent' (default-off skip signal, readLeafLabels precedent)", () => {
    const author: CapabilitySeat = {};
    expect(resolveSemanticMapCapability(author)).toBe("absent");
  });

  it("only synthesize → fail-loud configuration error (negative control)", () => {
    const author: CapabilitySeat = { synthesizeSemanticMapNode: synthesize };
    expect(() => resolveSemanticMapCapability(author)).toThrow(/PAIR/);
  });

  it("only verify → fail-loud configuration error (negative control)", () => {
    const author: CapabilitySeat = { verifySemanticMapBoundary: verify };
    expect(() => resolveSemanticMapCapability(author)).toThrow(/PAIR/);
  });
});
