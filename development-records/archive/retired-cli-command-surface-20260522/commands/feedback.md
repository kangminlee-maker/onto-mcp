# Domain Document Feedback

Feeds accumulated learnings back into domain documents for $ARGUMENTS.
$ARGUMENTS specifies the target domain name. Works for both seed (drafts/) and established (domains/) domains.

Example: `/onto:feedback palantir-foundry`

> Plugin install resolves via `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}`. Set `ONTO_PLUGIN_DIR` env var when installed in a custom location.

Read `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/process.md` (common definitions) and
`${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/.onto/processes/feedback.md`, then execute.
