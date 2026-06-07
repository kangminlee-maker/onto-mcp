import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendReviewInvocationRequestArgs,
  collectReviewInvocationArtifactRefs,
  parseReviewInvocationCliOutput,
  projectReviewInvocationEquivalence,
} from "./review-invocation-runner.js";

const tempRoots: string[] = [];

async function tempSessionRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-review-invocation-runner-"),
  );
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("appendReviewInvocationRequestArgs", () => {
  it("maps a typed request to the review invoke argv adapter shape", () => {
    const projectRoot = path.resolve("/tmp/onto-project");
    const argv = appendReviewInvocationRequestArgs(
      ["--no-watch"],
      {
        projectRoot,
        target: "src/index.ts",
        intent: "Review the target",
        domain: "software-development",
        reviewMode: "core-axis",
        targetScopeKind: "bundle",
        primaryRef: "src/index.ts",
        memberRefs: ["src/a.ts", "src/b.ts"],
        bundleKind: "implementation_change_bundle",
        diffRange: "HEAD~1..HEAD",
        executionRoute: "direct_model_call",
        lensIds: ["logic", "structure"],
        confirmValueAlignment: true,
      },
      { ontoHome: "/tmp/onto-home" },
    );

    expect(argv).toEqual([
      "--no-watch",
      "src/index.ts",
      "Review the target",
      "--project-root",
      projectRoot,
      "--onto-home",
      "/tmp/onto-home",
      "--domain",
      "software-development",
      "--requested-domain-token",
      "software-development",
      "--review-mode",
      "core-axis",
      "--target-scope-kind",
      "bundle",
      "--primary-ref",
      "src/index.ts",
      "--member-ref",
      "src/a.ts",
      "--member-ref",
      "src/b.ts",
      "--bundle-kind",
      "implementation_change_bundle",
      "--diff-range",
      "HEAD~1..HEAD",
      "--executor-realization",
      "ts_inline_http",
      "--lens-id",
      "logic",
      "--lens-id",
      "structure",
      "--confirm-value-alignment",
    ]);
  });

  it("keeps explicit no-domain distinct from omitted domain", () => {
    const argv = appendReviewInvocationRequestArgs(
      [],
      {
        projectRoot: ".",
        target: "README.md",
        intent: "Review docs",
        noDomain: true,
      },
      { ontoHome: "/tmp/onto-home" },
    );

    expect(argv).toContain("--no-domain");
    expect(argv).not.toContain("--domain");
  });

  it("rejects conflicting domain controls", () => {
    expect(() =>
      appendReviewInvocationRequestArgs(
        [],
        {
          projectRoot: ".",
          target: "README.md",
          intent: "Review docs",
          domain: "software-engineering",
          noDomain: true,
        },
        { ontoHome: "/tmp/onto-home" },
      ),
    ).toThrow("Use either domain or noDomain, not both.");
  });

  it("rejects conflicting canonical route and debug executor overrides", () => {
    expect(() =>
      appendReviewInvocationRequestArgs(
        [],
        {
          projectRoot: ".",
          target: "README.md",
          intent: "Review docs",
          executionRoute: "direct_model_call",
          executorRealization: "codex",
        },
        { ontoHome: "/tmp/onto-home" },
      ),
    ).toThrow("Conflicting review execution overrides");
  });
});

describe("collectReviewInvocationArtifactRefs", () => {
  it("returns only artifact refs that exist under the session root", async () => {
    const sessionRoot = await tempSessionRoot();
    await fs.mkdir(path.join(sessionRoot, "execution-preparation"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(sessionRoot, "binding.yaml"),
      "schema_version: '1'\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(
        sessionRoot,
        "execution-preparation",
        "review-target-profile.yaml",
      ),
      "schema_version: '1'\n",
      "utf8",
    );

    await expect(collectReviewInvocationArtifactRefs(sessionRoot)).resolves.toEqual({
      binding: path.join(sessionRoot, "binding.yaml"),
      review_target_profile: path.join(
        sessionRoot,
        "execution-preparation",
        "review-target-profile.yaml",
      ),
    });
  });
});

describe("parseReviewInvocationCliOutput", () => {
  it("parses the trailing adapter JSON result from captured stdout", () => {
    const parsed = parseReviewInvocationCliOutput([
      "[review invoke] step 1/3 start session",
      "{ not json",
      JSON.stringify(
        {
          review_result: {
            session_root: "/tmp/session",
            final_output_path: "/tmp/session/final-output.md",
            review_record_path: "/tmp/session/review-record.yaml",
            execution_result_path: "/tmp/session/execution-result.yaml",
            record_status: "completed",
            participating_lens_ids: ["logic"],
          },
          result_overview: { outcome: { status: "completed" } },
          bounded_invoke_steps: [
            "start_review_session",
            "run_review_prompt_execution",
            "complete_review_session",
          ],
        },
        null,
        2,
      ),
    ]);

    expect(parsed.review_result.session_root).toBe("/tmp/session");
    expect(parsed.review_result.record_status).toBe("completed");
    expect(parsed.bounded_invoke_steps).toEqual([
      "start_review_session",
      "run_review_prompt_execution",
      "complete_review_session",
    ]);
  });

  it("rejects output without the review result adapter shape", () => {
    expect(() =>
      parseReviewInvocationCliOutput([
        "[review invoke] completed",
        JSON.stringify({ ok: true }),
      ]),
    ).toThrow("review invocation completed without a structured JSON result.");
  });
});

describe("projectReviewInvocationEquivalence", () => {
  it("keeps semantic facts while ignoring volatile artifact values", () => {
    const base = {
      review_result: {
        session_root: "/tmp/session-a",
        final_output_path: "/tmp/session-a/final-output.md",
        review_record_path: "/tmp/session-a/review-record.yaml",
        execution_result_path: "/tmp/session-a/execution-result.yaml",
        record_status: "completed" as const,
        deliberation_status: "performed",
        participating_lens_ids: ["logic"],
        degraded_lens_ids: [],
      },
      entrypoint_plan: {
        domain_final_value: "software-engineering",
        domain_selection_mode: "explicit_token",
        review_mode: "core-axis",
      },
      route_summary: {
        execution_realization: "direct-call",
      },
      artifacts: {
        final_output: "/tmp/session-a/final-output.md",
        review_record: "/tmp/session-a/review-record.yaml",
      },
      bounded_invoke_steps: [
        "start_review_session",
        "run_review_prompt_execution",
        "complete_review_session",
      ],
    };
    const sameFactsDifferentSession = {
      ...base,
      review_result: {
        ...base.review_result,
        session_root: "/tmp/session-b",
        final_output_path: "/tmp/session-b/final-output.md",
        review_record_path: "/tmp/session-b/review-record.yaml",
        execution_result_path: "/tmp/session-b/execution-result.yaml",
      },
      artifacts: {
        final_output: "/tmp/session-b/final-output.md",
        review_record: "/tmp/session-b/review-record.yaml",
      },
    };

    expect(projectReviewInvocationEquivalence(base)).toEqual(
      projectReviewInvocationEquivalence(sameFactsDifferentSession),
    );
  });
});
