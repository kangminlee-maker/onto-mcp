---
version: 1
last_updated: "2026-03-29"
source: bundled-domain-baseline
status: established
---

# LLM-Native Development Domain — Prompt/Interface Design

This document defines the design criteria for structures that issue instructions to LLMs — system prompts, tool definitions, role definitions, and response formats.
While the existing 7 files cover "the structure of a system that describes knowledge," this file covers the separate concern dimension of "designing the knowledge consumption method."

## System Prompt Structure

- Prompts are structured in the order of role definition (who) → context (what) → task instructions (how) → constraints
- Role definitions are managed in individual files within the roles/ directory. They are not inlined into the prompt but read from files and included
- Context loading is either self-loading (agent reads files directly) or injection (team lead includes content). The choice depends on the agent's file reading capability

## Role Definition File Structure

Role definition files (roles/{agent-id}.md) include the following elements:
- **Specialization**: The concern this role verifies/performs
- **Role Description**: The core question this role answers
- **Core Questions**: 3~6 items. Define the judgment axes of the role
- **Domain Document Mapping**: Domain documents this role references (at least 1)

## Tool Definition (Tool Schema)

- Tool definitions follow JSON Schema format
- Tool names directly express the action (e.g., `search_files`, `read_document`)
- Tool descriptions must be specific enough for the LLM to judge tool selection
- Required parameters and optional parameters are clearly distinguished

## Response Format Constraints (Structured Output)

- When structured output is needed, specify the output format in the prompt
- Format specification methods: choose between examples or schemas (JSON Schema)
- When the format is complex, separate it into a file (templates/ directory) and reference from the prompt

## Context Window Utilization Strategy

- Prompt size is recommended to be 30% or less of the total context window. The remainder is allocated to work targets and responses
- For repeatedly executed prompts, separate static parts (role, rules) from dynamic parts (work target, previous results)
- When static parts do not change, consider caching or compression

## Related Documents
- concepts.md — Definitions of terms used in prompts
- structure_spec.md — Physical location rules for role files
- domain_scope.md — Higher-level definition of the "Consumption Interface" concern area
