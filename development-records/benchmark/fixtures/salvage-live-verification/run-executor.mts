import { runClaudeCodeReviewUnitExecutorCli } from "/Users/kangmin/cowork/onto-mcp-claude/src/core-runtime/cli/claude-code-review-unit-executor.ts";
const code = await runClaudeCodeReviewUnitExecutorCli(process.argv.slice(2));
process.exit(code);
