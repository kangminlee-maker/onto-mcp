import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// 검증 당시의 실측 세션(tmp) — 다른 환경에서 재현 시 SALVAGE_SESSION_ROOT로 지정.
const SESSION_ROOT = process.env.SALVAGE_SESSION_ROOT ??
  "/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-ontology-eval-manufacturing-bom-ffqgHx/.onto/review/20260611-ca3c674b";
const { runClaudeCodeReviewUnitExecutorCli } = await import(path.join(REPO_ROOT, "src/core-runtime/cli/claude-code-review-unit-executor.ts"));
const code = await runClaudeCodeReviewUnitExecutorCli(process.argv.slice(2));
process.exit(code);
