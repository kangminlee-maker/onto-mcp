import { describe, expect, it } from "vitest";
import {
  benchmarkFailureClassCounts,
  classifyBenchmarkRunFailure,
} from "./benchmark-failure-class.js";

describe("benchmark run failure classification", () => {
  it("classifies the live baseline failure modes from their messages", () => {
    expect(classifyBenchmarkRunFailure("codex CLI call timed out after 420000ms"))
      .toBe("timeout");
    expect(
      classifyBenchmarkRunFailure(
        "final-output.md failed provenance validation: final output is missing provenance-bound section: Artifact Truth",
      ),
    ).toBe("final_output_provenance");
    expect(
      classifyBenchmarkRunFailure(
        "ontology-seed validation failed at /tmp/.../ontology-seed-validation.yaml: 1. candidate_target_ref_invalid",
      ),
    ).toBe("ontology_seed_validation");
    expect(
      classifyBenchmarkRunFailure(
        "competency-questions validation failed at /tmp/...: missing_required_coverage",
      ),
    ).toBe("competency_questions_validation");
    expect(classifyBenchmarkRunFailure("some other validation failed somewhere"))
      .toBe("validation_other");
    expect(classifyBenchmarkRunFailure("connection refused")).toBe("other");
  });

  it("aggregates the committed live baseline inventory", () => {
    const counts = benchmarkFailureClassCounts([
      { failure_class: "final_output_provenance" },
      { failure_class: "ontology_seed_validation" },
      { failure_class: "final_output_provenance" },
      { failure_class: "competency_questions_validation" },
      { failure_class: "final_output_provenance" },
    ]);
    expect(counts).toEqual({
      final_output_provenance: 3,
      ontology_seed_validation: 1,
      competency_questions_validation: 1,
    });
  });
});
