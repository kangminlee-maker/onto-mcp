/**
 * Host-orchestration(B) round bridge CLI — S3 live 심의 실험의 host 평면 도구.
 *
 * core-api의 prepareReview/reviewRound/reviewAdvance만 호출하는 얇은 다리다
 * (런타임 무변경 — 설치된 MCP 서버가 round/advance를 노출하지 않아도 host가
 * repo core-api를 직접 부를 수 있게 한다). 결과는 한 줄 JSON으로 stdout에 쓴다.
 *
 * 사용:
 *   npx tsx scripts/review-host-round-cli.ts prepare --project-root P --target T --intent I \
 *     [--lens-ids a,b,c] [--review-mode core-axis] [--no-domain]
 *   npx tsx scripts/review-host-round-cli.ts round   --session-root S
 *   npx tsx scripts/review-host-round-cli.ts advance --session-root S --executed a,b,c [--project-root P]
 *
 * 계약: .onto/processes/review/live-deliberation-experiment-contract.md (L2)
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function coreApi() {
  const { createOntoReviewCoreApi } = await import(
    pathToFileURL(path.join(REPO_ROOT, "src/core-api/review-api.ts")).href
  );
  return createOntoReviewCoreApi({ ontoHome: REPO_ROOT });
}

export async function runHostRoundCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      "project-root": { type: "string" },
      "session-root": { type: "string" },
      target: { type: "string" },
      intent: { type: "string" },
      "lens-ids": { type: "string" },
      "review-mode": { type: "string" },
      "no-domain": { type: "boolean", default: false },
      executed: { type: "string" },
      "request-text": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  const require = (key: string): string => {
    const value = values[key as keyof typeof values];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`--${key} is required for '${command}'`);
    }
    return value;
  };
  const emit = (payload: unknown): void => {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };

  const api = await coreApi();
  switch (command) {
    case "prepare": {
      const prepared = await api.prepareReview({
        projectRoot: path.resolve(require("project-root")),
        target: require("target"),
        intent: require("intent"),
        noDomain: values["no-domain"] === true,
        ...(values["review-mode"] ? { reviewMode: values["review-mode"] } : {}),
        ...(values["lens-ids"]
          ? {
              lensIds: values["lens-ids"]
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0),
            }
          : {}),
      });
      emit({ status: "prepared", sessionRoot: prepared.sessionRoot });
      return 0;
    }
    case "round": {
      const result = await api.reviewRound({
        sessionRoot: path.resolve(require("session-root")),
      });
      emit(result);
      return 0;
    }
    case "advance": {
      const executed = require("executed")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (executed.length === 0) {
        throw new Error("--executed must contain at least one unit id");
      }
      const result = await api.reviewAdvance({
        sessionRoot: path.resolve(require("session-root")),
        executed,
        ...(values["project-root"]
          ? { projectRoot: path.resolve(values["project-root"]) }
          : {}),
        ...(values["request-text"] ? { requestText: values["request-text"] } : {}),
      });
      emit(result);
      return 0;
    }
    default:
      throw new Error(
        `unknown command: ${command ?? "(none)"} — use prepare | round | advance`,
      );
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  runHostRoundCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`[review-host-round-cli] ${(error as Error).message}`);
      process.exit(1);
    },
  );
}
