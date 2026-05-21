# Individual Query Mode

> Asks a question to a single agent from a specific perspective. Executed via Agent tool (worker) without Agent Teams.
> Related: If multiple perspectives are needed, run a team review via `/onto:review`. If learnings accumulate, promotion is possible via `.onto/processes/learn/promote.md`.

### 0. Domain Selection

Determine `{session_domain}` per the "Domain Determination Rules" in `process.md`.

- If `@{domain}` is specified in the command: use non-interactive resolution
- If `@-` is specified: set `{session_domain}` to empty (no-domain mode)
- Otherwise: run the Domain Selection Flow

---

### 1. Context Gathering

Follows the **error handling rules** in `process.md`: halts the process on agent definition/query target read failure. Treats learning/domain document absence as "not yet available" and continues.

1. **Agent file collection**:
   - Definition: `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/.onto/roles/{agent-id}.md`
   - Verification learning: `~/.onto/learnings/{agent-id}.md`
   - Communication learning: `~/.onto/communication/common.md`
   - Skip if file does not exist.

2. **Domain document collection**:
   - Reads the agent's domain document from `~/.onto/domains/{session_domain}/`.
   - Skip if `{session_domain}` is empty (no-domain mode).

3. **Project-level learning collection** (mandatory):
   - **Project**: `{project}/.onto/learnings/{agent-id}.md` — learnings accumulated in the project. **Must be read if this directory exists.**
   - Skip if file does not exist.

3. **Query target collection**:
   - If the question references files/code: reads the relevant content.
   - Identifies the system purpose and principles from the project's CLAUDE.md, README.md.

### 2. Agent Execution

Executes the agent as a **single-agent run** via Agent tool.

Delivery content:

```
You are {role}.
Answer the question below from your specialized perspective.

[Your Definition]
{Content of ${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/.onto/roles/{agent-id}.md}

[Past Learnings — Verification]
{Content of ~/.onto/learnings/{agent-id}.md + {project}/.onto/learnings/{agent-id}.md. "Not yet available" if absent}

[Domain Rules]
{Content of the agent's domain document. "No domain document" if absent}

[Communication Learning]
{Content of ~/.onto/communication/common.md. "Not yet available" if absent}

[Question]
{$ARGUMENTS}

[System Purpose and Principles]
{CLAUDE.md/README.md content}

[Directives]
- Answer from your specialized perspective, using core questions as the basis.
- Include domain rules in the verification criteria.
- For content outside your specialized area, mark it as "This aspect requires the perspective of {other agent}."
- Reference past learnings, but ignore learnings that do not apply to the current question.

[Report Format]
Include the following section at the end of your answer:

### Newly Learned
For each learning, determine purpose type, impact severity, and axis tags
per learning-rules.md.

- Communication learning: (findings about user preferences/communication style)
- Learning: [{fact|judgment}] [{axis tags}] [{purpose type}] (content) [impact:{severity}]
  - Axis tags: `[methodology]` and/or `[domain/{session_domain}]`.
    Apply 2+1 stage test per learning-rules.md.
  - If {session_domain} is empty: `[methodology]` only
  - For guardrail type: **Situation**: ... **Result**: ... **Corrective action**: ...
  - If a domain-specific fact **influenced your judgment**, record it separately.
Mark each as "none" if there is nothing to report.

### Applied Learnings
List learnings from your learning file that influenced your review judgment:
- Learning: {summary} (source: {source})
  - "이 학습이 없었다면 이번 리뷰에서 놓쳤을 발견이 있는가?" (yes/no)
- If a loaded learning was applied but found invalid/harmful during this review,
  attach event marker to the learning file:
  `<!-- applied-then-found-invalid: {date}, {session_id}, {reason} -->`
  (Event marker attachment is agent-autonomous — no approval needed.)
Mark "none" if no learnings were applied.
```

### 3. Result Output

Delivers the agent's answer to the user.
If any items are marked as requiring another agent's perspective, inform the user:
"The perspective of {agent name} may also be helpful for this question. You can check further via `/onto:ask-{dimension} {question}`."

### 4. Learning Storage

Follows the "Learning Storage Rules" in `learning-rules.md`.
