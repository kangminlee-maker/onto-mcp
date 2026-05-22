# Data Backup

Creates a timestamped snapshot of onto user data (learnings, domains, drafts, communication) in $ARGUMENTS.
$ARGUMENTS is an optional reason for the backup.

Examples:
  `/onto:backup` — manual backup
  `/onto:backup "before learning cleanup"` — backup with reason

> Plugin install resolves via `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}`. Set `ONTO_PLUGIN_DIR` env var when installed in a custom location.

Read `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/process.md` (common definitions) and
`${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/.onto/processes/backup.md`, then execute.
