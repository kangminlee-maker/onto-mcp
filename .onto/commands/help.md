# Onto Help

Read `{project}/.onto/settings.json` to check `output_language:` and render this
reference in the configured language.

## Core Workflow

```text
/onto:onboard                         Project setup
/onto:review {target}                 Review target
/onto:review {target} --domain {name} Domain-aware review
/onto:review {target} --no-domain     Methodology-only review
/onto:reconstruct {path|URL}          Reconstruct ontology from implementation
/onto:evolve {goal}                   Design an ontology-based extension
```

## Review Runtime

Review runs:

1. interpretation
2. binding
3. context-isolated lens execution
4. controlled lens deliberation
5. synthesize
6. `review-record.yaml` + `final-output.md`

Primary CLI path:

```bash
npm run review:invoke -- <target> "<intent>"
```

MCP path:

```text
onto.review
```

## Domain Selection

| Method | Syntax | Behavior |
|---|---|---|
| explicit | `--domain {name}` | Uses one configured domain |
| no domain | `--no-domain` | Uses methodology-only standards |
| interactive | omit both flags | Runtime asks when selection is ambiguous |

`--domain` and `--no-domain` are mutually exclusive.

## Configuration

Active config contract:

- `.onto/processes/configuration.md`
- `.onto/processes/onboard.md`

Key blocks:

- `review.execution:` selects review coordination and worker seats.
- `llm:` selects auth/provider/model.

## More Info

- README: `README.md`
- Agent orientation: `AGENTS.md`
- Authority docs: `.onto/authority/`
- Review contracts: `.onto/processes/review/`
- Domain documents: `.onto/domains/`
