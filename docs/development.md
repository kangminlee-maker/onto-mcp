# Development Guide

Repository-local verification harnesses are internal; they are not product
entrypoints. The public interface is the MCP server (see the
[README](../README.md)).

## Repository map

| Path | Role |
|---|---|
| `.onto/authority/` | canonical ontology data and runtime registries |
| `.onto/processes/shared/` | cross-process target and runtime contracts |
| `.onto/processes/review/` | review contracts |
| `.onto/processes/reconstruct/` | reconstruct contracts and source profiles |
| `.onto/domains/` | bundled domain documents |
| `src/core-runtime/` | TypeScript runtime |
| `src/core-api/` | library facade used by MCP |
| `src/mcp/` | MCP tool surface |
| `development-records/` | development records and archived material |
| `IMPLEMENTATION_MAP.html` | visual architecture and roadmap map |

## Verification

```bash
npm run check:ts-core
npm run build:ts-core
npm run check:mcp:review
npm run check:review:route
npm run test:e2e
git diff --check
```

Route hardening is available as a development verification harness:

```bash
npm run check:review:route
```

It validates the configured review route and provider/auth preflight behavior.
Mock-backed or fixture-backed checks should be reported separately from live
E2E evidence: test-only mock helpers are verification realizations — they can
support contract and harness checks, but they are not product completion or
semantic quality evidence.
