---
version: 4
last_updated: "2026-05-28"
source: merged-from-llm-native-development
status: established
---

# Software Engineering Domain — Prompt and Agent Interface Criteria

This document defines design criteria for prompts, role instructions, tool schemas, response formats, and agent handoffs used inside software-engineering workflows.

## System Prompt Structure

- System prompts must separate stable role/rules from dynamic task input.
- Prompts that affect behavior must be versioned, reviewable, and tied to an artifact seat.
- Context loading must be explicit: either the agent reads declared files/resources, or runtime injects a bounded context bundle.
- Historical notes, deprecated behavior, and migration rationale must not be loaded into active execution context unless the task specifically needs that history.

## Role Definition Structure

Role definitions for LLM workers or agents must include:

- purpose and non-purpose
- inputs the role is allowed to use
- outputs the role must produce
- tools/resources available to the role
- forbidden actions
- failure behavior and escalation path

## Ownership Boundary Structure

Prompt, role, handoff, and tool interfaces must reference the LLM/runtime/middleware boundary vocabulary in `concepts.md` and state the task-specific ownership split when more than one layer participates in behavior. This section owns interface obligations, not the canonical boundary definitions.

An interface that crosses the boundary must declare:

- the semantic work delegated to the LLM role
- the deterministic gates and authority seats owned by runtime
- the transport/adaptation work owned by middleware
- accepted input and output shape for each boundary crossing
- enforcement profile, trust/artifact status, and diagnostic behavior
- forbidden crossovers, especially semantic repair by runtime/middleware and LLM bypass of runtime-owned validation, persistence, authority assembly, authorization, idempotency, or cost/security gates

## Tool Definition Structure

Every tool exposed to an agent must include:

- name and concise purpose
- parameter schema with required/optional fields
- result shape and trust status
- failure modes and retry safety
- permission or side-effect boundary
- examples only when they reduce ambiguity

Tool definitions with overlapping capability must include routing guidance or be consolidated.

Tool definitions for high-impact actions must additionally include:

- required human approval condition
- idempotency or rollback expectation
- audit artifact emitted on success/failure
- forbidden use cases
- sensitive input/output handling

## Response Format Constraints

- Structured output must be validated by runtime before consumption.
- Format instructions in a prompt do not replace schema validation.
- When output becomes an authority artifact, malformed output must fail-close and fail-loud unless a documented repair rule exists.
- If a response is degraded, partial, or draft-only, that status must be visible in the output and artifact metadata.

## Output Sink Constraints

Prompt and response contracts must name any downstream sink that will consume model output.

| Sink | Required runtime gate |
|---|---|
| Shell/CLI | command allowlist or parser, argument escaping, approval for destructive actions |
| SQL/database | parameterization, authorization, transaction/idempotency handling |
| HTML/Markdown/user display | output encoding/sanitization, trust/status markers where needed |
| File path/filesystem | path normalization, root-boundary validation, overwrite/destructive-action policy |
| Email/chat/external message | recipient authorization, disclosure policy, approval for sensitive/high-impact content |
| API/tool call | schema validation, permission check, side-effect classification |
| Authority artifact | schema validation, provenance, trust status, deterministic assembly gate |

If no sink is known at prompt time, the output must be treated as draft/untrusted until the sink is declared and validated.

## Context Window Utilization

- Static prompt material should be small enough to leave room for user input, retrieved context, and output.
- Token budget should be checked before dispatch when truncation would remove instructions, evidence, or schemas.
- Retrieved context used as evidence must carry provenance.
- Critical instructions and output schemas should be placed where the model is least likely to lose them under long context.

## External Content Handling

- User input, webpage text, file contents, retrieved snippets, email bodies, logs, and tool output must be framed as data unless a runtime-owned policy explicitly grants instruction authority.
- Prompts should label untrusted external content and instruct the model not to treat it as role, tool, permission, or output-format authority.
- Runtime/context assembly must preserve source refs and permission scope for external content used as evidence.
- Hidden instructions found in external content are a prompt-injection case, not a valid override.

## Agent Permission and Autonomy

Agent-facing instructions must distinguish:

- functionality: what the tool/runtime can do
- permission: what the agent is authorized to do in this task/user/tenant scope
- autonomy: what the agent may do without human approval

An agent prompt that says "use tools as needed" is under-specified unless tool permission, autonomy, retry safety, and high-impact approval boundaries are declared elsewhere in the contracted input.

## Fail-Loud Interface Rule

For development, review, and authority-update paths, an interface that cannot provide the required prompt, context, tool, model, or output contract should stop with a diagnostic artifact. Silent fallback is more costly than visible failure because it hides the failing boundary and forces later exploration.

Graceful degradation is allowed for user-facing product behavior only when the reduced capability, cause, diagnostic reference, and recovery path are explicit.

## Related Documents

- concepts.md — LLM-native engineering terms
- logic_rules.md — LLM boundary logic and failure posture
- structure_spec.md — LLM-native system structure
- competency_qs.md — CQ-A questions for AI agent and LLM-native collaboration
