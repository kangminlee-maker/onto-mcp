# Development Guide

Repository-local verification harnesses are internal; they are not product
entrypoints. The public interface is the MCP server (see the
[README](../README.md)).

## Repository map

The repo-layout SSOT is
[architecture/repo-layout.md](architecture/repo-layout.md): folder roles,
`src/core-runtime/` internal structure, and placement rules live there.

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
