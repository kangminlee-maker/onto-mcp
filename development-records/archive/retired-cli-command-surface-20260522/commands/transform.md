# Onto Transform

Transforms a built Raw Ontology into the user's desired format. $ARGUMENTS specifies the target file for transform. If not specified, `.onto/builds/{session ID}/raw.yml` is used as the target.

Plugin install resolves via `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}`. Set `ONTO_PLUGIN_DIR` env var when installed in a custom location.

Read `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/process.md` (common definitions) and
`${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/.onto/processes/transform.md`, then execute.
