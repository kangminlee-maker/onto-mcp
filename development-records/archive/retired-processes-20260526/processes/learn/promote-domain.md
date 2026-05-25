# Domain Promotion Process

> Promotes a seed domain from drafts/ to established domains/.
> Related: Seeds are created by `.onto/processes/create-domain.md`. Feedback loop improves seeds via `.onto/processes/feedback.md`.

Moves a domain from `~/.onto/drafts/{domain}/` to `~/.onto/domains/{domain}/` after verifying all promotion preconditions. This is a one-way operation — demotion is not supported.

### 0. Precondition Check

| Check | Condition | On Failure |
|---|---|---|
| Source exists | `~/.onto/drafts/{domain}/` exists | Report error: "No draft domain `{domain}` found in drafts/." Halt. |
| Destination vacant | `~/.onto/domains/{domain}/` does NOT exist | Report error: "Domain `{domain}` already exists in domains/." Halt. |

### 1. SEED Marker Scan

Scan all files in `~/.onto/drafts/{domain}/` for SEED markers (`<!-- SEED:` ... `<!-- /SEED -->`).

**Required count: 0.** If any SEED markers remain, show a blocking report and halt:

```markdown
## Promotion Blocked — SEED Markers Remain

| File | SEED Marker Count |
|---|---|
| concepts.md | {N} |
| competency_qs.md | {N} |
| ... | ... |

**Total**: {total} SEED markers remaining.

Remove all SEED markers before promoting. Use the feedback process to replace seed content with evidence-based content, or edit files directly.
```

### 2. Structural Validation

Verify all 8 required domain document files are present in `~/.onto/drafts/{domain}/`:

- `domain_scope.md`
- `concepts.md`
- `competency_qs.md`
- `logic_rules.md`
- `structure_spec.md`
- `dependency_rules.md`
- `extension_cases.md`
- `conciseness_rules.md`

**Reason**: The user may have deleted or renamed files after seed creation. This re-verification ensures structural completeness at promotion time.

If any files are missing, report the missing files and halt.

### 3. User Confirmation

Present the promotion plan for user approval:

```markdown
## Domain Promotion Plan

| Item | Value |
|---|---|
| Domain | {domain} |
| Source | ~/.onto/drafts/{domain}/ |
| Destination | ~/.onto/domains/{domain}/ |
| Files to move | {count} (8 domain files + feedback-log.md if present) |
| settings.json update | Add `{domain}` to `domains:` list (if not already present) |

Proceed with promotion?
```

### 4. Promotion Execution

Upon user approval, execute the following:

1. **Move directory**: `~/.onto/drafts/{domain}/` → `~/.onto/domains/{domain}/`
   - This includes `feedback-log.md` if it exists — the feedback history travels with the domain.

2. **Update settings.json**: Add `{domain}` to the `domains:` list in `{product}/.onto/settings.json`.
   - **Idempotent**: If `{domain}` is already in the list, do not add a duplicate entry.
   - If `settings.json` or `domains:` key does not exist, inform the user that manual configuration may be needed.

### 5. Completion Report

```markdown
## Domain Promotion Complete

| Item | Result |
|---|---|
| Domain | {domain} |
| New location | ~/.onto/domains/{domain}/ |
| Files moved | {count} |
| settings.json | {updated / already contained / not found} |

The domain is now established and will be available for selection in review sessions.
```
