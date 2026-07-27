import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { afterAll, describe, expect, it } from "vitest";
import { callLlm } from "../llm/llm-caller.js";
import { createDirectCallReconstructDirectiveAuthor } from "./direct-call-directive-author.js";
import {
  handleFacadeMessage,
  OBSERVATION_READ_LAUNCH_TOKEN_ENV,
  OBSERVATION_READ_TOOL_NAME,
  ObservationReadFacadeSession,
  observationReadFacadeCodexArgs,
  observationReadFacadeServerEntry,
  parseObservationReadFacadeDescriptor,
  writeObservationReadFacadeDescriptor,
  type ObservationReadFacadeLaunch,
} from "./observation-read-facade.js";
import { OBSERVATION_READ_MAX_REQUEST_IDS } from "./observation-read.js";

// Spec basis: design 20260726-observation-catalog-tool §3 (`인용 ⊆ 조회 ⊆ 스냅샷`), §4, §9 stage 3b.
// Stage 3a made the prompt a navigation catalog; this is the layer that serves the detail behind it and
// then refuses a citation the dispatch never fetched.
//
// The transport is the only thing stubbed. The injected llmCall plays the WORKER: it reads the facade
// launch the author attached to the dispatch config, writes the descriptor exactly as the codex route
// does, drives a REAL ObservationReadFacadeSession over the real MCP handler, and answers with the
// model's JSON. Everything under test — descriptor, grant, receipt, citation check — is production code.

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "scripts/fixtures/observation-catalog");
const TEMP_ROOT = mkdtempSync(path.join(os.tmpdir(), "onto-observation-pull-"));
let tempSeq = 0;

afterAll(() => {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
});

const observationsArtifact = parseYaml(
  readFileSync(path.join(FIXTURE_DIR, "source-observations.yaml"), "utf8"),
) as { observations: { observation_id: string; source_ref: string }[] };
const ledgerArtifact = parseYaml(
  readFileSync(path.join(FIXTURE_DIR, "source-safety-ledger.yaml"), "utf8"),
) as Record<string, unknown>;
const allObservationIds = observationsArtifact.observations.map((o) => o.observation_id);

function writePullSources() {
  tempSeq += 1;
  const workDir = path.join(TEMP_ROOT, `run-${tempSeq}`);
  mkdtempSync(`${workDir}-`);
  const dir = mkdtempSync(path.join(TEMP_ROOT, `session-${tempSeq}-`));
  const observationsPath = path.join(dir, "source-observations.yaml");
  const safetyLedgerPath = path.join(dir, "source-safety-ledger.yaml");
  const safetyLedgerValidationPath = path.join(dir, "source-safety-ledger-validation.yaml");
  writeFileSync(
    observationsPath,
    readFileSync(path.join(FIXTURE_DIR, "source-observations.yaml"), "utf8"),
  );
  writeFileSync(
    safetyLedgerPath,
    stringifyYaml({ ...ledgerArtifact, source_observations_ref: path.resolve(observationsPath) }),
  );
  writeFileSync(
    safetyLedgerValidationPath,
    stringifyYaml({
      schema_version: "1",
      session_id: ledgerArtifact.session_id,
      created_at: "2026-07-27T00:00:00.000Z",
      source_safety_ledger_ref: path.resolve(safetyLedgerPath),
      source_observations_ref: path.resolve(observationsPath),
      validation_status: "valid",
      safety_row_count: (ledgerArtifact.safety_rows as unknown[]).length,
      no_prompt_use_count: 0,
      validation_results: ["source_safety_ledger_valid"],
      asserted_obligation_ids: [],
      violations: [],
    }),
  );
  return { observationsPath, safetyLedgerPath, safetyLedgerValidationPath, workDir: dir };
}

const SESSION_ID = "observation-read-pull-fixture";

function authorInput(pull: ReturnType<typeof writePullSources>) {
  const observations = observationsArtifact.observations.slice(0, 6);
  const requestedRef = observations[0]!.source_ref;
  return {
    sessionId: SESSION_ID,
    roundId: "maturation-round-1",
    maturationQuestionFrontier: {
      schema_version: "1",
      session_id: SESSION_ID,
      created_at: "2026-07-27T00:00:00.000Z",
      maturation_baseline_ref: "maturation-baseline.yaml",
      maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
      actionability_matrix_ref: "baseline-actionability-matrix.yaml",
      actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
      questions: [{
        question_id: "q-pull",
        question: "What supports the answer?",
        materiality: "blocker",
        materiality_ref: "row-pull",
        actionability_surface_refs: ["dynamic_surface"],
        maturity_dimension_refs: ["evidence"],
        purpose_element_refs: ["purpose-pull"],
        baseline_row_refs: ["baseline-pull"],
        competency_question_refs: [],
        competency_assessment_refs: [],
        domain_competency_trace_refs: [],
        seed_ref_refs: ["object-pull"],
        current_answer_status: "unsupported",
        expected_answer_kind: "explanation",
        evidence_needed: "Pull evidence.",
        authority_need: {
          authority_kind: "none",
          authority_scope: null,
          blocking_if_unavailable: true,
          expected_response_kind: "unavailable_reason",
        },
        closure_frontier_hint_refs: [],
        limitation_refs: [],
      }],
      directive_author: { owner: "host_llm", author_id: "fixture" },
    },
    maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
    maturationQuestionFrontierValidation: {
      schema_version: "1",
      session_id: SESSION_ID,
      created_at: "2026-07-27T00:00:00.000Z",
      maturation_question_frontier_ref: "maturation-question-frontier.yaml",
      maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
      actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
      validation_status: "valid",
      question_count: 1,
      material_frontier_question_count: 1,
      validation_results: [],
      violations: [],
    },
    maturationClosureFrontier: {
      schema_version: "1",
      session_id: SESSION_ID,
      created_at: "2026-07-27T00:00:00.000Z",
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [{
        source_request_id: "req-pull",
        question_refs: ["q-pull"],
        member_scope_refs: [],
        member_source_refs: [],
        cross_material_ref_refs: [],
        requested_source_ref: requestedRef,
        requested_location: requestedRef,
        target_material_kind: "code",
        expected_evidence_kind: "pull source",
        reason: "needed",
      }],
      authority_requests: [],
      directive_author: { owner: "host_llm", author_id: "fixture" },
    },
    maturationClosureFrontierValidation: {
      schema_version: "1",
      session_id: SESSION_ID,
      created_at: "2026-07-27T00:00:00.000Z",
      maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
      maturation_question_frontier_validation_ref: "maturation-question-frontier-validation.yaml",
      source_inventory_ref: "source-inventory.yaml",
      source_observations_ref: "source-observations.yaml",
      validation_status: "valid",
      source_request_count: 1,
      authority_request_count: 0,
      accepted_source_request_ids: ["req-pull"],
      rejected_source_requests: [],
      validation_results: [],
      asserted_obligation_ids: [],
      violations: [],
    },
    maturationAuthorityResponse: {
      schema_version: "1",
      session_id: SESSION_ID,
      created_at: "2026-07-27T00:00:00.000Z",
      closure_frontier_ref: "maturation-closure-frontier.yaml",
      responses: [],
    },
    maturationAuthorityResponseValidation: {
      schema_version: "1",
      session_id: SESSION_ID,
      created_at: "2026-07-27T00:00:00.000Z",
      maturation_authority_response_ref: "maturation-authority-response.yaml",
      maturation_closure_frontier_validation_ref: "maturation-closure-frontier-validation.yaml",
      validation_status: "valid",
      response_count: 0,
      provided_response_count: 0,
      unavailable_response_count: 0,
      validation_results: [],
      violations: [],
    },
    sourceObservations: { ...observationsArtifact, observations },
    observationReadPull: {
      observationsPath: pull.observationsPath,
      safetyLedgerPath: pull.safetyLedgerPath,
      safetyLedgerValidationPath: pull.safetyLedgerValidationPath,
      workDir: pull.workDir,
    },
  } as never;
}

/**
 * Author whose injected llmCall plays the worker: it does what the codex route does with the facade
 * launch (write the descriptor, run the server) and then answers. `fetchIds` is what the "model"
 * chooses to fetch; `citeIds` is what it then claims.
 */
function authorWithWorker(options: {
  fetchIds: string[];
  citeIds: string[];
  /** Skip the facade entirely — the worker never fetched, and no receipt is written at all. */
  skipFacade?: boolean;
}) {
  const dispatched: { systemPrompt: string; userPrompt: string; config: Record<string, any> }[] = [];
  const author = createDirectCallReconstructDirectiveAuthor({
    sourceObservationCatalogTool: true,
    llmCall: (systemPrompt: string, userPrompt: string, config?: Record<string, any>) => {
      dispatched.push({ systemPrompt, userPrompt, config: config ?? {} });
      const launch = config?.observation_read_facade as ObservationReadFacadeLaunch | undefined;
      if (launch && options.skipFacade !== true) {
        // Exactly what callCodexCli does: write the descriptor from the parts about to be dispatched.
        writeObservationReadFacadeDescriptor({ launch, systemPrompt, userPrompt });
        const session = new ObservationReadFacadeSession({
          descriptor: parseObservationReadFacadeDescriptor(
            readFileSync(launch.descriptorPath, "utf8"),
          ),
        });
        if (options.fetchIds.length > 0) {
          const result = handleFacadeMessage(
            {
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: {
                name: OBSERVATION_READ_TOOL_NAME,
                arguments: { observation_ids: options.fetchIds },
              },
            },
            session,
          )!.result as { isError: boolean };
          session.commit(); // the process shell publishes after delivery; the stub plays that role too
          if (result.isError) throw new Error("fixture worker's fetch failed");
        }
      }
      return Promise.resolve({
        text: JSON.stringify({
          evidence_clusters: [{
            evidence_cluster_id: "cluster-pull",
            question_refs: ["q-pull"],
            support_mode: "convergent_source_evidence",
            proposed_answer_summary: "The fetched observations converge.",
            evidence_observation_ids: options.citeIds,
            proof_refs: [],
            user_confirmation_refs: [],
            authority_response_refs: [],
            independence_basis: "fixture",
            contradiction_refs: [],
            limitation_refs: [],
          }],
        }),
      });
    },
  } as never);
  return { author, dispatched };
}

describe("observation read pull layer — 인용 ⊆ 조회 (design §3, stage 3b)", () => {
  it("admits a citation the dispatch actually fetched", async () => {
    const pull = writePullSources();
    const fetched = allObservationIds.slice(0, 2);
    const { author, dispatched } = authorWithWorker({ fetchIds: fetched, citeIds: fetched });
    const ledger = await (author as any).writeAnswerSupportLedger(authorInput(pull));
    expect(ledger.evidence_clusters.length).toBe(1);
    expect(ledger.evidence_clusters[0].evidence_refs.length).toBe(2);
    // The facade really was attached to this dispatch (otherwise the checks below are vacuous).
    expect(dispatched[0]!.config.observation_read_facade).toBeDefined();
  });

  it("rejects a citation the dispatch never fetched — the id is in the catalog but was not served", async () => {
    const pull = writePullSources();
    const fetched = [allObservationIds[0]!];
    const cited = [allObservationIds[0]!, allObservationIds[1]!];
    const { author } = authorWithWorker({ fetchIds: fetched, citeIds: cited });
    // The second id IS in the prompt catalog — the existing catalog gate would admit it — so what
    // rejects it is the served check, not the pre-existing one.
    await expect((author as any).writeAnswerSupportLedger(authorInput(pull))).rejects.toThrow(
      /never served: .*\b/,
    );
  });

  it("rejects every citation when the worker fetched nothing at all", async () => {
    const pull = writePullSources();
    const { author } = authorWithWorker({ fetchIds: [], citeIds: [allObservationIds[0]!] });
    await expect((author as any).writeAnswerSupportLedger(authorInput(pull))).rejects.toThrow(
      /never served/,
    );
  });

  it("fails closed when no receipt exists at all (the facade never ran)", async () => {
    const pull = writePullSources();
    const { author } = authorWithWorker({
      fetchIds: [],
      citeIds: [allObservationIds[0]!],
      skipFacade: true,
    });
    // No receipt file is written, so the served set is empty rather than unchecked.
    await expect((author as any).writeAnswerSupportLedger(authorInput(pull))).rejects.toThrow(
      /never served/,
    );
  });

  it("does not apply the served check when the pull layer is absent (push-only stays as it was)", async () => {
    const pull = writePullSources();
    const input = authorInput(pull) as Record<string, unknown>;
    delete input.observationReadPull;
    const { author, dispatched } = authorWithWorker({
      fetchIds: [],
      citeIds: [allObservationIds[0]!],
    });
    const ledger = await (author as any).writeAnswerSupportLedger(input);
    expect(ledger.evidence_clusters[0].evidence_refs.length).toBe(1);
    expect(dispatched[0]!.config.observation_read_facade).toBeUndefined();
  });

  it("announces the tool in the payload — codex does not advertise MCP tools to the model", async () => {
    const pull = writePullSources();
    const fetched = [allObservationIds[0]!];
    const { author, dispatched } = authorWithWorker({ fetchIds: fetched, citeIds: fetched });
    await (author as any).writeAnswerSupportLedger(authorInput(pull));
    const payload = JSON.parse(dispatched[0]!.userPrompt) as Record<string, any>;
    const announcement = payload.source_observation_fetch_tool;
    expect(announcement.tool_name).toBe(OBSERVATION_READ_TOOL_NAME);
    expect(announcement.how).toContain(String(OBSERVATION_READ_MAX_REQUEST_IDS));
    // The rule the runtime actually enforces must be the rule the worker is told.
    expect(announcement.citation_rule).toMatch(/did not fetch/);
    // ...and it is absent without the pull layer, so the prompt never names a tool that does not exist.
    const withoutPull = authorInput(pull) as Record<string, unknown>;
    delete withoutPull.observationReadPull;
    // Cite one id: an empty evidence list is rejected by the ledger's own parser, which would make this
    // arm fail for an unrelated reason.
    const other = authorWithWorker({ fetchIds: [], citeIds: [allObservationIds[0]!] });
    await (other.author as any).writeAnswerSupportLedger(withoutPull);
    expect(JSON.parse(other.dispatched[0]!.userPrompt).source_observation_fetch_tool).toBeUndefined();
  });

  it("writes a descriptor whose prompt parts ARE the dispatched parts", async () => {
    const pull = writePullSources();
    const fetched = [allObservationIds[0]!];
    const { author, dispatched } = authorWithWorker({ fetchIds: fetched, citeIds: fetched });
    await (author as any).writeAnswerSupportLedger(authorInput(pull));
    const launch = dispatched[0]!.config.observation_read_facade as ObservationReadFacadeLaunch;
    const descriptor = parseObservationReadFacadeDescriptor(
      readFileSync(launch.descriptorPath, "utf8"),
    );
    // The budget is derived from these two strings; if they were not the dispatched ones the grant
    // would meter against a prompt that was never sent (stage 2's F6, structurally removed).
    expect(descriptor.system_prompt).toBe(dispatched[0]!.systemPrompt);
    expect(descriptor.user_prompt).toBe(dispatched[0]!.userPrompt);
    expect(descriptor.sources.observationsPath).toBe(pull.observationsPath);
    expect(descriptor.ttl_ms).toBeGreaterThan(0);
  });
});

describe("observation read pull layer — receipt lifecycle across dispatches", () => {
  /**
   * PROBE 1 — the parse-repair dispatch. `callJsonAuthor` dispatches a SECOND time with the SAME
   * llmConfig when the first output is not parseable JSON, so the facade is registered again with the
   * same receipt path and its session constructor rewrites that receipt as "granted, served nothing".
   * The worker really did fetch; the repair only reformats its JSON. Rejecting here fails a correct run.
   */
  it("keeps the served evidence when the JSON parse-repair dispatch runs", async () => {
    const pull = writePullSources();
    const fetched = allObservationIds.slice(0, 2);
    let dispatchIndex = 0;
    const dispatched: { config: Record<string, any> }[] = [];
    const author = createDirectCallReconstructDirectiveAuthor({
      sourceObservationCatalogTool: true,
      llmCall: (systemPrompt: string, userPrompt: string, config?: Record<string, any>) => {
        dispatchIndex += 1;
        dispatched.push({ config: config ?? {} });
        const launch = config?.observation_read_facade as ObservationReadFacadeLaunch | undefined;
        if (launch) {
          writeObservationReadFacadeDescriptor({ launch, systemPrompt, userPrompt });
          const session = new ObservationReadFacadeSession({
            descriptor: parseObservationReadFacadeDescriptor(
              readFileSync(launch.descriptorPath, "utf8"),
            ),
          });
          // Only the FIRST dispatch carries the catalog and the tool announcement, so only it fetches.
          // The repair prompt is a JSON fixer; a worker on it has nothing to fetch.
          if (dispatchIndex === 1) {
            handleFacadeMessage(
              {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {
                  name: OBSERVATION_READ_TOOL_NAME,
                  arguments: { observation_ids: fetched },
                },
              },
              session,
            );
            session.commit();
          }
        }
        if (dispatchIndex === 1) return Promise.resolve({ text: "{ not json" });
        return Promise.resolve({
          text: JSON.stringify({
            evidence_clusters: [{
              evidence_cluster_id: "cluster-repair",
              question_refs: ["q-pull"],
              support_mode: "convergent_source_evidence",
              proposed_answer_summary: "The fetched observations converge.",
              evidence_observation_ids: fetched,
              proof_refs: [],
              user_confirmation_refs: [],
              authority_response_refs: [],
              independence_basis: "fixture",
              contradiction_refs: [],
              limitation_refs: [],
            }],
          }),
        });
      },
    } as never);
    const ledger = await (author as any).writeAnswerSupportLedger(authorInput(pull));
    expect(dispatchIndex).toBe(2);
    expect(ledger.evidence_clusters[0].evidence_refs.length).toBe(2);
    // The repair dispatch must lose the facade and NOTHING ELSE: a strip that also dropped the model,
    // effort or timeout would still make this test pass on the citation alone.
    const [initial, repair] = dispatched;
    expect(Object.keys(initial!.config)).toContain("observation_read_facade");
    expect(Object.keys(repair!.config)).not.toContain("observation_read_facade");
    const droppedKeys = Object.keys(initial!.config).filter((key) =>
      !Object.keys(repair!.config).includes(key)
    );
    expect(droppedKeys).toEqual(["observation_read_facade"]);
    for (const key of Object.keys(repair!.config)) {
      if (key === "max_tokens") continue; // callJsonAuthor sizes the repair turn separately
      expect(repair!.config[key], key).toEqual(initial!.config[key]);
    }
  });

  it("starts each dispatch from an empty receipt path, without relying on the token check", async () => {
    // The launch token binding refuses a stale receipt, but a binding is a comparison and a comparison
    // can be wrong — it was. Clearing the path removes the precondition instead of detecting it, so the
    // two defences fail independently. This arm proves the CLEAR happens: the stale file is one the
    // token check would have accepted, because it carries this dispatch's own token.
    const pull = writePullSources();
    const stalePath = path.join(pull.workDir, "observation-read-receipt-maturation-round-1.json");
    let observedLaunchToken: string | undefined;
    const author = createDirectCallReconstructDirectiveAuthor({
      sourceObservationCatalogTool: true,
      llmCall: (_s: string, _u: string, config?: Record<string, any>) => {
        const launch = config?.observation_read_facade as ObservationReadFacadeLaunch | undefined;
        observedLaunchToken = launch?.launchToken;
        // The facade never starts — the failure mode this exists for. Nothing writes a receipt now, so
        // whatever survives at the path is what the runtime will read.
        return Promise.resolve({
          text: JSON.stringify({
            evidence_clusters: [{
              evidence_cluster_id: "cluster-stale",
              question_refs: ["q-pull"],
              support_mode: "convergent_source_evidence",
              proposed_answer_summary: "Cited without fetching.",
              evidence_observation_ids: [allObservationIds[0]!],
              proof_refs: [],
              user_confirmation_refs: [],
              authority_response_refs: [],
              independence_basis: "fixture",
              contradiction_refs: [],
              limitation_refs: [],
            }],
          }),
        });
      },
    } as never);
    // Seed the path, then let the author build its launch — which must clear it.
    writeFileSync(stalePath, "placeholder");
    await expect((author as any).writeAnswerSupportLedger(authorInput(pull))).rejects.toThrow(
      /never served/,
    );
    expect(observedLaunchToken).toBeTruthy();
    expect(existsSync(stalePath)).toBe(false);
  });

  /**
   * PROBE 2 — a receipt left at the same path by an EARLIER dispatch or run. The path is derived from
   * the session root and a literal roundId, so a resumed run reuses it. Nothing binds the file to this
   * launch, so if this dispatch's facade never starts — the exact failure the live probe hit, where
   * codex launched a server that died instantly — the runtime reads the stale file and admits citations
   * for content this worker never read. That is the inverse of fail-closed.
   */
  it("refuses a receipt left behind by another dispatch", async () => {
    const pull = writePullSources();
    const stalePath = path.join(pull.workDir, "observation-read-receipt-maturation-round-1.json");
    writeFileSync(
      stalePath,
      JSON.stringify({
        schema_version: "observation-read-facade-receipt/v1",
        receipt: {
          grant_id: "grant-from-a-previous-run",
          snapshot_digest: "stale",
          admitted_observation_count: 1,
          withheld_observation_count: 0,
          budget: {},
          calls_served: 1,
          chars_served: 10,
          served: [{ observation_id: allObservationIds[0]!, chars: 10 }],
        },
        rejected_before_grant: 0,
      }),
    );
    // The facade never runs in this dispatch: the worker had no tool and fetched nothing.
    const { author } = authorWithWorker({
      fetchIds: [],
      citeIds: [allObservationIds[0]!],
      skipFacade: true,
    });
    await expect((author as any).writeAnswerSupportLedger(authorInput(pull))).rejects.toThrow(
      /never served/,
    );
  });
});

describe("observation read pull layer — the codex launch it produces", () => {
  const launch: ObservationReadFacadeLaunch = {
    sources: {
      observationsPath: "/session/source-observations.yaml",
      safetyLedgerPath: "/session/source-safety-ledger.yaml",
      safetyLedgerValidationPath: "/session/source-safety-ledger-validation.yaml",
    },
    descriptorPath: "/session/descriptor.json",
    receiptPath: "/session/receipt.json",
    launchToken: "launch-token",
    ttlMs: 600_000,
  };

  it("registers the server, the launch token, and the REQUIRED approval lever", () => {
    const args = observationReadFacadeCodexArgs(launch);
    const joined = args.join(" ");
    expect(joined).toContain(observationReadFacadeServerEntry());
    expect(joined).toContain("--descriptor=/session/descriptor.json");
    expect(joined).toContain(`mcp_servers.onto_observation.env.${OBSERVATION_READ_LAUNCH_TOKEN_ENV}`);
    // Measured 2026-07-27 (design §5.5): without this the worker's call dies as
    // `user cancelled MCP tool call`, and neither `auto` nor a global approval policy substitutes.
    expect(joined).toContain('mcp_servers.onto_observation.default_tools_approval_mode="approve"');
    // Scoped to OUR server only — it must not approve anything else the worker might reach.
    const approvalKeys = args.filter((a) => a.includes("default_tools_approval_mode"));
    expect(approvalKeys.length).toBe(1);
    expect(approvalKeys[0]).toMatch(/^mcp_servers\.onto_observation\./);
    expect(joined).not.toContain("approval_policy=");
  });

  it("names a command that can actually RUN the resolved entry", async () => {
    // A live probe registered `process.execPath` against a `.ts` entry: codex launched it, node died
    // instantly, and the worker reported the tool as unavailable. The command and the entry have to
    // match, so this executes the pair rather than trusting the pairing.
    const args = observationReadFacadeCodexArgs(launch);
    const command = /mcp_servers\.onto_observation\.command="(.+)"/.exec(args.join("\n"))?.[1];
    expect(command).toBeTruthy();
    const entry = observationReadFacadeServerEntry();
    const probe = await new Promise<number | null>((resolve) => {
      // No descriptor: the entry must still START and refuse deliberately (exit 2), which proves the
      // command executes it. A command that cannot run it exits 1 with a loader error.
      const child = spawn(command!, [entry], { stdio: ["ignore", "ignore", "pipe"] });
      child.on("exit", (code) => resolve(code));
    });
    expect(probe).toBe(2);
  }, 60_000);

  it("quotes every value it injects into codex config", () => {
    const spaced: ObservationReadFacadeLaunch = {
      ...launch,
      descriptorPath: "/tmp/a dir/descriptor.json",
    };
    const args = observationReadFacadeCodexArgs(spaced);
    // A path with a space must survive as one TOML string, not split the config value.
    expect(args.join(" ")).toContain('"--descriptor=/tmp/a dir/descriptor.json"');
  });
});

describe("observation read pull layer — the facade is codex-only", () => {
  it("fails loud when the facade reaches a non-codex route", async () => {
    const launch: ObservationReadFacadeLaunch = {
      sources: {
        observationsPath: "/x",
        safetyLedgerPath: "/y",
        safetyLedgerValidationPath: "/z",
      },
      descriptorPath: "/d",
      receiptPath: "/r",
      launchToken: "t",
      ttlMs: 1_000,
    };
    // Anthropic route: the worker would have no such tool, and the run would fail much later as a
    // missing fetch. Refuse at the seam instead.
    await expect(
      callLlm("system", "user", {
        provider: "anthropic",
        model_id: "claude-haiku-4-5-20251001",
        observation_read_facade: launch,
      }),
    ).rejects.toThrow(/non-codex dispatch route/);
  });
});
