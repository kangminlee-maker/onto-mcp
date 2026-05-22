/**
 * drift-engine unit tests (W-C-02 v0).
 *
 * 검증 대상 (W-C-02 seat verification_method):
 *   1. drift 감지 + 큐 등록 + Principal 승인 흐름 (integration)
 *   2. 수준 0→1 판정 조건 3건 (self_apply / queue / principal_direct)
 *   3. 경계 guard (classify boundary cases)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleGovernCli } from "./cli.js";
import { classifyProposal, routeProposal } from "./drift-engine.js";
import { resolveQueuePath } from "./queue.js";

describe("drift-engine classifier (W-C-02 v0, §1.3 수준 0→1 3 분기)", () => {
  it("수준 1-A self_apply: docs_only + 단일 target → route=self_apply", () => {
    const decision = classifyProposal({
      summary: "README 오타 수정",
      target_files: ["README.md"],
      change_kind: "docs_only",
    });
    expect(decision.route).toBe("self_apply");
    expect(decision.matched_rule).toBe("local_docs_single");
  });

  it("수준 1-B queue: code change 여러 파일 → route=queue", () => {
    const decision = classifyProposal({
      summary: "review runtime 리팩터",
      target_files: [
        "src/core-runtime/review/invoke.ts",
        "src/core-runtime/review/packet.ts",
      ],
      change_kind: "code",
    });
    expect(decision.route).toBe("queue");
    expect(decision.matched_rule).toBe("drift_default");
  });

  it("수준 1-C principal_direct: .onto/authority/ prefix → route=principal_direct", () => {
    const decision = classifyProposal({
      summary: "lexicon v0.13.0 entity 추가",
      target_files: [".onto/authority/core-lexicon.yaml"],
      change_kind: "config",
    });
    expect(decision.route).toBe("principal_direct");
    expect(decision.matched_rule).toBe("governance_core");
  });

  it("boundary: .onto/principles/ 도 governance core → principal_direct", () => {
    const decision = classifyProposal({
      summary: "OaC 가이드라인 보강",
      target_files: [".onto/principles/ontology-as-code-guideline.md"],
      change_kind: "docs_only",
    });
    expect(decision.route).toBe("principal_direct");
  });

  it("boundary: .onto/processes/govern.md 는 governance core → principal_direct (self-modification 차단)", () => {
    const decision = classifyProposal({
      summary: "govern process §8 scope 수정",
      target_files: [".onto/processes/govern.md"],
      change_kind: "docs_only",
    });
    expect(decision.route).toBe("principal_direct");
  });

  it("boundary: 단일 docs 파일이어도 .onto/authority 포함 시 principal_direct 우선", () => {
    const decision = classifyProposal({
      summary: "lexicon term 수정",
      target_files: [".onto/authority/core-lexicon.yaml"],
      change_kind: "docs_only",
    });
    expect(decision.route).toBe("principal_direct");
    expect(decision.matched_rule).toBe("governance_core");
  });

  it("boundary: docs_only 이지만 2+ 파일 → queue (local 경계 이탈)", () => {
    const decision = classifyProposal({
      summary: "README + implementation map 일괄 갱신",
      target_files: ["README.md", "IMPLEMENTATION_MAP.html"],
      change_kind: "docs_only",
    });
    expect(decision.route).toBe("queue");
  });

  it("boundary: mixed change_kind + 단일 파일 → queue (docs-only 아님)", () => {
    const decision = classifyProposal({
      summary: "설정 + 문서 혼합 수정",
      target_files: ["src/core-runtime/config.ts"],
      change_kind: "mixed",
    });
    expect(decision.route).toBe("queue");
  });

  it("boundary: .onto/authority/ (Phase 6 canonical) 도 governance core → principal_direct", () => {
    const decision = classifyProposal({
      summary: "Phase 6 rename 이후 lexicon 갱신",
      target_files: [".onto/authority/core-lexicon.yaml"],
      change_kind: "config",
    });
    expect(decision.route).toBe("principal_direct");
    expect(decision.matched_rule).toBe("governance_core");
  });

  it("Phase 7 canonical-only: legacy design-principles/ 는 governance core 가 아님 (일반 문서로 간주)", () => {
    // Phase 7 에서는 legacy layout 을 governance core 로 보지 않음. 단일 파일 docs 라서
    // self_apply 분기로 라우팅되는 게 정상.
    const decision = classifyProposal({
      summary: "legacy layout 잔존 참조",
      target_files: ["design-principles/ontology-as-code-guideline.md"],
      change_kind: "docs_only",
    });
    expect(decision.route).toBe("self_apply");
    expect(decision.matched_rule).toBe("local_docs_single");
  });

  it("boundary: segment-bound — .onto/authorityX/ 같은 near-miss prefix 는 governance core 아님", () => {
    const decision = classifyProposal({
      summary: "유사 이름 디렉토리 변경",
      target_files: [".onto/authorityX/foo.md"],
      change_kind: "docs_only",
    });
    expect(decision.route).toBe("self_apply");
    expect(decision.matched_rule).toBe("local_docs_single");
  });
});

describe("drift-engine router (큐 append 동작)", () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "onto-drift-router-"));
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("self_apply: 큐에 append 하지 않음 (no-op)", () => {
    const outcome = routeProposal(
      {
        summary: "README 오타",
        target_files: ["README.md"],
        change_kind: "docs_only",
      },
      tmpRoot,
    );
    expect(outcome.decision.route).toBe("self_apply");
    expect(outcome.queue_event_id).toBeUndefined();
  });

  it("queue: govern queue 에 origin=system, tag=drift event append + payload.route=queue", () => {
    const outcome = routeProposal(
      {
        summary: "runtime 리팩터",
        target_files: ["src/core-runtime/review/invoke.ts", "src/core-runtime/review/packet.ts"],
        change_kind: "code",
      },
      tmpRoot,
    );
    expect(outcome.decision.route).toBe("queue");
    expect(outcome.queue_event_id).toMatch(/^g-/);
    const raw = readFileSync(resolveQueuePath(tmpRoot), "utf-8");
    const event = JSON.parse(raw.trim());
    expect(event.type).toBe("submit");
    expect(event.origin).toBe("system");
    expect(event.tag).toBe("drift");
    expect(event.submitted_by).toBe("drift-engine");
    expect(event.payload.route).toBe("queue");
    expect(event.payload.matched_rule).toBe("drift_default");
  });

  it("principal_direct: queue 에 payload.route=principal_direct marker 로 append", () => {
    const outcome = routeProposal(
      {
        summary: "lexicon 변경",
        target_files: [".onto/authority/core-lexicon.yaml"],
        change_kind: "config",
      },
      tmpRoot,
    );
    expect(outcome.decision.route).toBe("principal_direct");
    const raw = readFileSync(resolveQueuePath(tmpRoot), "utf-8");
    const event = JSON.parse(raw.trim());
    expect(event.payload.route).toBe("principal_direct");
    expect(event.payload.matched_rule).toBe("governance_core");
  });
});

describe("drift 감지 + 큐 등록 + Principal 승인 흐름 (end-to-end)", () => {
  let tmpRoot: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "onto-drift-e2e-"));
    logs = [];
    origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
  });
  afterEach(() => {
    console.log = origLog;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function lastLogJson(): unknown {
    return JSON.parse(logs[logs.length - 1]!);
  }

  it("route → list(pending) → decide 전체 흐름 통과", async () => {
    // (1) drift engine 이 변경 제안을 route → queue 분기 → queue 에 append
    const routeCode = await handleGovernCli("", [
      "route",
      "--json",
      JSON.stringify({
        summary: "review runtime 변경",
        target_files: ["src/core-runtime/review/invoke.ts", "src/core-runtime/review/packet.ts"],
        change_kind: "code",
      }),
      "--project-root",
      tmpRoot,
    ]);
    expect(routeCode).toBe(0);
    const routed = lastLogJson() as { status: string; route: string; queue_event_id: string };
    expect(routed.route).toBe("queue");
    const eventId = routed.queue_event_id;

    // (2) list --status pending 으로 확인
    logs.length = 0;
    await handleGovernCli("", [
      "list",
      "--status",
      "pending",
      "--format",
      "json",
      "--project-root",
      tmpRoot,
    ]);
    const entries = lastLogJson() as Array<{ id: string; origin: string; tag: string }>;
    expect(entries.length).toBe(1);
    expect(entries[0]!.id).toBe(eventId);
    expect(entries[0]!.origin).toBe("system");
    expect(entries[0]!.tag).toBe("drift");

    // (3) Principal 판정 — decide reject (code 수정 쪽으로 가자 = 문서 유지)
    logs.length = 0;
    const decideCode = await handleGovernCli("", [
      "decide",
      eventId,
      "--verdict",
      "reject",
      "--reason",
      "코드 쪽을 문서에 맞추는 방향으로 수정",
      "--project-root",
      tmpRoot,
    ]);
    expect(decideCode).toBe(0);
    const decided = lastLogJson() as { status: string; verdict: string };
    expect(decided.status).toBe("decided");
    expect(decided.verdict).toBe("reject");

    // (4) list --status decided 로 감사 경로 확인 (dead-letter 방지)
    logs.length = 0;
    await handleGovernCli("", [
      "list",
      "--status",
      "decided",
      "--format",
      "json",
      "--project-root",
      tmpRoot,
    ]);
    const decidedEntries = lastLogJson() as Array<{
      id: string;
      verdict: { verdict: string; reason: string };
    }>;
    expect(decidedEntries.length).toBe(1);
    expect(decidedEntries[0]!.id).toBe(eventId);
    expect(decidedEntries[0]!.verdict.verdict).toBe("reject");
  });
});

describe("route CLI input guards", () => {
  let tmpRoot: string;
  let errs: string[];
  let origErr: typeof console.error;
  let origLog: typeof console.log;
  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "onto-drift-guard-"));
    errs = [];
    origErr = console.error;
    origLog = console.log;
    console.error = (...args: unknown[]) => {
      errs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    console.log = () => {};
  });
  afterEach(() => {
    console.error = origErr;
    console.log = origLog;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("missing --json → error", async () => {
    const code = await handleGovernCli("", ["route", "--project-root", tmpRoot]);
    expect(code).toBe(1);
    expect(errs.some((e) => e.includes("--json proposal is required"))).toBe(true);
  });

  it("invalid change_kind → error", async () => {
    const code = await handleGovernCli("", [
      "route",
      "--json",
      JSON.stringify({
        summary: "x",
        target_files: ["a.md"],
        change_kind: "bogus",
      }),
      "--project-root",
      tmpRoot,
    ]);
    expect(code).toBe(1);
    expect(errs.some((e) => e.includes("change_kind"))).toBe(true);
  });

  it("empty target_files → error", async () => {
    const code = await handleGovernCli("", [
      "route",
      "--json",
      JSON.stringify({
        summary: "x",
        target_files: [],
        change_kind: "code",
      }),
      "--project-root",
      tmpRoot,
    ]);
    expect(code).toBe(1);
    expect(errs.some((e) => e.includes("target_files"))).toBe(true);
  });

  it("missing summary → error", async () => {
    const code = await handleGovernCli("", [
      "route",
      "--json",
      JSON.stringify({
        target_files: ["a.md"],
        change_kind: "code",
      }),
      "--project-root",
      tmpRoot,
    ]);
    expect(code).toBe(1);
    expect(errs.some((e) => e.includes("summary"))).toBe(true);
  });
});
