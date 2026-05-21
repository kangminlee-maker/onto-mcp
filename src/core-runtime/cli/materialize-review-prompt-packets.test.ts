import { describe, expect, it } from "vitest";
import { renderLensOutputSchemaGate } from "./materialize-review-prompt-packets.js";

describe("renderLensOutputSchemaGate", () => {
  it("requires exact empty YAML lists for domainless reviews", () => {
    const text = renderLensOutputSchemaGate("none");

    expect(text).toContain("### Domain Constraints Used\n[]");
    expect(text).toContain("### Domain Context Assumptions\n[]");
    expect(text).toContain("only valid YAML list content");
  });

  it("renders required durable provenance object fields for domain-backed reviews", () => {
    const text = renderLensOutputSchemaGate("software-engineering");

    expect(text).toContain("source_doc");
    expect(text).toContain("source_version_or_snapshot_id");
    expect(text).toContain("anchor");
  });
});
