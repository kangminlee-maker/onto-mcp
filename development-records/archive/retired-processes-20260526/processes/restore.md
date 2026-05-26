# Data Restore

> Restores onto user data from a previous backup.
> Automatically creates a pre-restore backup as a safety net.

### 0. Backup Listing (no argument)

If `$ARGUMENTS` is empty, list available backups:

1. Scan `~/.onto/_backups/` for directories
2. Read each `manifest.md` for summary
3. Display:

```
## Available Backups

| # | Backup ID | Date | Reason | Domains | Learnings |
|---|-----------|------|--------|---------|-----------|
| 1 | 20260329-143022 | 2026-03-29 14:30 | before domain cleanup | 3 | 42 lines |
| 2 | 20260328-091500 | 2026-03-28 09:15 | manual backup | 2 | 28 lines |

To restore: use the restore process with the selected backup id.
```

If no backups exist: "No backups found. Create a backup first."

### 1. Pre-Restore Safety Backup

Before restoring, automatically create a backup of the current state:

1. Execute the backup process (.onto/processes/backup.md) with reason: `"pre-restore safety backup (before restoring {backup-id})"`
2. Record the safety backup ID

### 2. Validation

1. Verify `~/.onto/_backups/{backup-id}/` exists → error if not
2. Read `manifest.md` for summary
3. Display what will be restored:

```
## Restore Plan: {backup-id}

Source: ~/.onto/_backups/{backup-id}/
Safety backup created: {safety-backup-id}

| Data | Current | Will be replaced with |
|------|---------|----------------------|
| Learnings | {current count} files | {backup count} files |
| Domains | {current list} | {backup list} |
| Drafts | {current list} | {backup list} |
| Communication | {current count} files | {backup count} files |

⚠ This will replace all current data with the backup.
Current state has been saved to {safety-backup-id}.

Proceed? [y/n]
```

### 3. Restore Execution

Upon user confirmation:

1. **Remove current data**: Delete contents of `learnings/`, `domains/`, `drafts/`, `communication/` under `~/.onto/`
2. **Copy backup data**: Copy each directory from the backup into `~/.onto/`
3. **Preserve non-backup data**: Do not touch `_backups/`, config files, or any other directories

### 4. Output

```
## Restore Complete

Restored from: {backup-id} ({date})
Safety backup: {safety-backup-id}

| Data | Restored |
|------|----------|
| Learnings | {n} files |
| Domains | {list} |
| Drafts | {list} |
| Communication | {n} files |

To undo this restore: use the restore process with `{safety-backup-id}`.
```

### 5. Selective Restore (Future)

Phase 0 restores all data at once. Future enhancement: selective restore by data type or domain.
