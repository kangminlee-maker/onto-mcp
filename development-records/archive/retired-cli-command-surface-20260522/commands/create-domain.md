# Create Domain (Seed Generation)

Generates seed domain documents for $ARGUMENTS. Expects: {domain-name} {description}.
If description is not provided, it will be requested interactively.

Example: `/onto:create-domain palantir-foundry "Data pipeline and app development on the Palantir Foundry platform"`

> Plugin install resolves via `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}`. Set `ONTO_PLUGIN_DIR` env var when installed in a custom location.

Read `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/process.md` (common definitions) and
`${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/.onto/processes/create-domain.md`, then execute.
