import { describe, expect, it } from "vitest";
import {
  isDeprecatedDomainAlias,
  normalizeDomainValue,
} from "./review-artifact-utils.js";

describe("normalizeDomainValue", () => {
  it("canonicalizes the retired llm-native-development domain to software-engineering", () => {
    expect(normalizeDomainValue("llm-native-development")).toBe("software-engineering");
    expect(normalizeDomainValue("@llm-native-development")).toBe("software-engineering");
  });

  it("preserves canonical domains and no-domain tokens", () => {
    expect(normalizeDomainValue("software-engineering")).toBe("software-engineering");
    expect(normalizeDomainValue("@-")).toBe("none");
    expect(normalizeDomainValue("none")).toBe("none");
  });
});

describe("isDeprecatedDomainAlias", () => {
  it("identifies retired domain aliases without hiding canonical domains", () => {
    expect(isDeprecatedDomainAlias("llm-native-development")).toBe(true);
    expect(isDeprecatedDomainAlias("@llm-native-development")).toBe(true);
    expect(isDeprecatedDomainAlias("software-engineering")).toBe(false);
  });
});
