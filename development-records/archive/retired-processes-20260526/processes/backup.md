# Data Backup

> Creates a timestamped snapshot of onto user data (`~/.onto/`).
> Enables rollback when learning rot or domain document issues occur.

### 0. Scope

Backup targets (all under `~/.onto/`):

| Directory | Content | Included |
|-----------|---------|----------|
| `learnings/` | Global agent learnings | Yes |
| `domains/` | Established domain documents | Yes |
| `drafts/` | Seed domain documents | Yes |
| `communication/` | Communication learnings | Yes |
| `_backups/` | Previous backups | No (excluded) |

Project-level data (`{project}/.onto/`) is **not** included — it is project-specific and should be managed via git.

### 1. Backup Execution

1. **Generate backup ID**: `{YYYYMMDD}-{HHMMSS}` (e.g., `20260329-143022`)
2. **Create backup directory**: `~/.onto/_backups/{backup-id}/`
3. **Copy data**: For each target directory that exists, copy it into the backup:
   ```
   ~/.onto/_backups/{backup-id}/
   ├── learnings/
   ├── domains/
   ├── drafts/
   └── communication/
   ```
4. **Write manifest**: Save `~/.onto/_backups/{backup-id}/manifest.md`:
   ```markdown
   # Backup {backup-id}
   - Date: {YYYY-MM-DD HH:MM:SS}
   - Reason: {user-provided reason or "manual backup"}
   - Learnings: {count} files, {total lines} lines
   - Domains: {list of domain names}
   - Drafts: {list of draft domain names}
   - Communication: {count} files
   ```

### 2. Output

```
## Backup Complete: {backup-id}

Location: ~/.onto/_backups/{backup-id}/
| Data | Files | Size |
|------|-------|------|
| Learnings | {n} | {size} |
| Domains | {n} domains | {size} |
| Drafts | {n} domains | {size} |
| Communication | {n} | {size} |

To restore: use the restore process with the selected backup id.
To list all backups: use the restore process without a backup id.
```

### 3. Optional: Reason

If `$ARGUMENTS` contains text after the command, use it as the backup reason in the manifest.

```
backup request without reason         → reason: "manual backup"
backup request with reason            → reason: "before domain cleanup"
```
