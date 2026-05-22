# Promote Domain (seed → established)

Promotes a seed domain from drafts/ to domains/ for $ARGUMENTS.
$ARGUMENTS specifies the domain name.
Requires all SEED markers to be removed before promotion.

Example: `/onto:promote-domain palantir-foundry`

Plugin install resolves via `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}`. Set `ONTO_PLUGIN_DIR` env var when installed in a custom location.

Read `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/process.md` (common definitions) and
`${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/.onto/processes/learn/promote-domain.md`, then execute.
