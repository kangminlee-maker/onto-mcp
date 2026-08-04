# Development Guide

Repository-local verification harnesses are internal; they are not product
entrypoints. The public interface is the MCP server (see the
[README](../README.md)).

## Repository map

The repo-layout SSOT is
[architecture/repo-layout.md](architecture/repo-layout.md): folder roles,
`src/core-runtime/` internal structure, and placement rules live there.

## Once per clone

```bash
git config core.hooksPath .githooks
```

This turns on the committed `pre-push` hook, which runs
`scripts/check-push-currency.sh` over the range being pushed. The hook lives in
the repo rather than in `.git/hooks` so the rule travels with the code instead of
with one laptop. Skipping this step does not weaken the merge gate — CI runs the
same check on every pull request — it only delays the feedback until then.

## Verification

Gates that block, and what each one decides:

| Gate | Decides |
|---|---|
| `npm run check:doc-currency` (G13) | active runtime never names a file inside `development-records/`, and every repo document path an active file names exists on disk |
| `npm run check:shipped-links` (G14) | every relative link in a shipped document resolves inside the npm tarball |
| `npm run check:push-currency` (G15) | a range that changes active runtime also moves `IMPLEMENTATION_MAP.html` |

Each has a `:self-test` twin that plants a known violation and fails if the gate
survives it. Run the twin before trusting a green: a gate that cannot be shown to
fail is not evidence.

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
