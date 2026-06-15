# onto `.mcpb` Desktop Extension

This directory packages the onto MCP server as a Claude Desktop Extension
(`.mcpb`) for one-click install — Phase 1 item 4 of the Host Usability Roadmap
(`docs/architecture/mcp-native-tool-surface.md`). The CLI path (`onto register`)
remains available for advanced setup; the bundle is the chat-host convenience
front end over the same authority model.

## What the bundle is

`onto.mcpb` is a zip of `manifest.json` plus a pruned, runnable onto server
(`dist/`, `bin/onto`, the `.onto/` registries, and production `node_modules`).
On install, Claude Desktop:

1. launches the server in the **simple** profile (`ONTO_MCP_PROFILE=simple`, the
   8-tool chat-host surface) via `node ${__dirname}/bin/onto mcp --global`;
2. collects provider config through `user_config` (`provider`, `model`, `auth`,
   `api_key` — the key flagged sensitive) and substitutes those values into the
   server `env`;
3. on first start, a one-time bootstrap seeds `~/.onto/settings.json` from that
   env via the existing `onto configure-provider` write-path. This materializes
   the canonical settings file once; it is **not** a new runtime authority
   (INV-CFG-1). The runtime still reads `settings.json` as the sole settings
   authority. Only the env-var NAME (`api_key_env`) is ever persisted; the API
   key value stays in env.

`--global` makes the launch hermetic: it short-circuits project-local
delegation so the bundle's own staged server runs, instead of being handed off
to an unrelated project's `node_modules/onto-mcp`.

## Build

```sh
npm run build:mcpb
```

This stages a pruned production tree, validates `manifest.json`, and produces
`packaging/mcpb/onto.mcpb`. The bundle `version` mirrors `package.json`.

## Install in Claude Desktop + E2E check (manual)

This path is inherently manual (a real host install). Steps:

1. **Install.** In Claude Desktop, open Settings → Extensions and install
   `packaging/mcpb/onto.mcpb` (or double-click the file).
2. **Fill `user_config`.** Provide:
   - `provider` (e.g. `openai`, `anthropic`) — required;
   - `model` (the model id) — required;
   - `auth` (`api_key` / `oauth` / `local`) — optional; see the openai note below;
   - `api_key` — optional, sensitive (stored by Desktop, passed in `env`; onto
     persists only the env-var name, never the key value).
3. **Confirm connect.** The extension should report connected and list the
   simple-profile tools.
4. **Confirm seeding.** Check that `~/.onto/settings.json` now exists with review
   actors (`review.execution.actors.teamlead/lens/synthesize`) **and** reconstruct
   actors (`reconstruct.execution.actors.semantic_author/confirmation_provider`).
   See `settings.example.json` at the repo root for the expected shape.
5. **Smoke the tools.** Run `onto_list` (e.g. `kind="lenses"`) to confirm the
   registries load, then start a small `onto_review` on a tiny target and confirm
   it returns a session/run handle (use `onto_review_read` with `latest=true` to
   check on it if it returns `status: running`).

If bootstrap cannot write settings (e.g. permissions), the server still starts;
tools then fail loud at call time via the settings loader. Re-running with valid
`user_config` re-materializes the seat (a complete, valid existing seat is left
untouched — no clobber).

## openai: API key vs OAuth

`auth` is explicit because its meaning is provider-dependent for openai:

- **`auth=api_key`** → the **direct** route reads the supplied `api_key`.
- **blank `auth` (or `auth=oauth`) for openai** → the **OAuth** route is selected
  and the `api_key` is **ignored**.

So an openai user who supplied an API key must set `auth=api_key` for it to be
used. `auth=oauth` is only valid for `openai` and `anthropic`. When `auth` is
left blank, bootstrap derives the loader-consistent default (the same value the
runtime loader would derive) and writes it explicitly so both review and
reconstruct actors materialize — auth is never inferred from key presence.
