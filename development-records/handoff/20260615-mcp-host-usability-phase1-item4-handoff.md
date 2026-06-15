# Handoff — MCP Host Usability Phase 1 item 4 (.mcpb packaging) → goal C

> Date: 2026-06-15 · Track memory: `[[mcp-host-usability-track]]` (loaded each session) ·
> Authority/design doc: `docs/architecture/mcp-native-tool-surface.md` §Host Usability Roadmap.
> This is a handoff log (isolated history); current behavior lives in the doc + code.

## Start here (one-liner)
Implement **Phase 1 item 4 — `.mcpb` Desktop Extension packaging** of the MCP Host
Usability Roadmap, building on the already-implemented `onto configure-provider`
(item 2 core). The user's stated goal is **C** = the full Desktop install experience
(item 2 `user_config` wiring + item 4 packaging together). item 4 is the last Phase 1
piece. **It is a large slice with manual Claude Desktop E2E — design first, confirm, then build.**

## Where things are (as of this handoff)
- **Working branch**: `feat/mcp-phase1-user-config` (main folder `/Users/kangmin/cowork/onto-mcp-claude`).
  - Head `218d3db` = item 2 core (`onto configure-provider`). **Committed, NOT pushed, no PR yet.**
  - Branched from `main` (then `9bcd843`). Decide: PR item 2 separately, or stack item 4 and ship one **C bundle PR**.
- **Merged to main already**: item 3 (tool consolidation, PR #50) · item 1 (polling acceptance, PR #52).
- **Working tree**: clean except untracked `development-records/benchmark/**` fixtures from the *parallel reconstruct/benchmark* work — **not ours, do not touch/commit**.
- Parallel reconstruct work lives in separate worktrees (`../onto-mcp-closure`, `../onto-mcp-l1a`). **Do not touch them or the shared reconstruct branches.**

## Roadmap status (docs/architecture/mcp-native-tool-surface.md §Host Usability Roadmap)
- ✅ item 3 — tool surface 16→12 + simple/full profiles + deprecated aliases (merged).
- ✅ item 1 — polling acceptance: profile-aware sync window + `onto_review_read` fallback + terminal-signal (merged).
- ✅ item 2 **core** — `onto configure-provider` settings writer (on this branch, `218d3db`).
- ⏳ item 4 — `.mcpb` manifest + packaging **(this handoff)**. Completes item 2's `user_config` wiring.

## What item 4 must deliver
A one-click **Claude Desktop Extension** (`.mcpb` bundle = zip of `manifest.json` + the onto MCP server) such that installing it:
1. registers/launches `onto mcp` (stdio) — likely with **`ONTO_MCP_PROFILE=simple`** set (the chat-host 8-tool profile already exists),
2. collects LLM provider config via the manifest's **`user_config`** fields (provider/model/auth/api key — secrets flagged sensitive),
3. seeds the provider by driving those values into `onto configure-provider` → writes `~/.onto/settings.json` (the sole settings authority).

## Building blocks ALREADY in place (reuse — do not duplicate)
- **`onto configure-provider`** (`src/core-runtime/onboard/configure-provider.ts`, this branch): the INV-CFG-1-safe **input channel**. Flags: `--provider <p> --model <m> [--auth --api-key-env --effort --service-tier --base-url --project]`. Writes review actors always; reconstruct actors only when `--auth` given (reconstruct's v3 schema requires auth; no default is baked in). Writes only `api_key_env` (never the key), validates via the real loader, atomic write. **This is exactly what item 4's `user_config` should invoke.**
- **`ONTO_MCP_PROFILE=simple`** (`src/mcp/server.ts` `resolveToolProfile`/`advertisedToolDefinitions`): the bounded 8-tool desktop profile. The `.mcpb` launch should set this env.
- **`onto register`** (`src/core-runtime/onboard/register.ts`): writes *host* configs (claude_desktop_config.json `mcpServers`) — reference for how hosts are wired today; `.mcpb` is the one-click alternative.
- **`bin/onto`** entry + `npm run build:ts-core` (tsx-based dev; production needs a build). The bundle needs runnable code — confirm build output / how to package a tsx CLI.

## INVARIANTS / constraints (non-negotiable)
- **INV-CFG-1**: `settings.json/v3` chain is the SOLE authority for provider/auth/model/effort/retry; no code defaults; no env-backed settings seat. `user_config` MUST flow through `onto configure-provider` (which writes settings.json) — **do NOT** add a parallel config path or have the server read provider/auth/model directly from env.
- Secrets: only `api_key_env` (the env var NAME) goes in settings.json; API keys stay in env. `user_config` api-key field → maps to an env var the server reads (`OPENAI_API_KEY` etc. or a named one).
- Read `INVARIANTS.md` + run G1/G2/G4 before commit. G2 (`check:spec-defaults`) will flag any model/auth/effort/retry literal — keep manifest values as data, not code defaults.

## Open design decisions to settle FIRST (then confirm with user)
1. **MCPB manifest spec** — research the real format (refs below). `manifest.json`: `user_config` field types (string/boolean/file/directory; `sensitive` flag), the server `command`/`args`/`env`, and **how `user_config` values reach the process** (mcpb substitutes them into `env`/`args` of the server launch).
2. **How `user_config` → `onto configure-provider`** — mcpb launches the *server* with env/args; it doesn't obviously run a separate setup command. Options:
   - (a) **First-run bootstrap**: on `onto mcp` startup, if `user_config` env present AND no usable settings, invoke the configure-provider write-path ONCE to materialize `~/.onto/settings.json`, then proceed. (Careful: keep it a one-time *write to settings.json*, NOT runtime env-as-authority — stays INV-CFG-1-safe because it writes the canonical file.)
   - (b) **Documented manual step** / a dedicated install command. Less seamless.
   - Decide (a) vs (b); (a) is the seamless C experience but needs careful framing to stay INV-CFG-1-clean (it's a one-time materialization, not a new authority).
3. **Packaging/build** — binary vs node bundle; how to include the onto server (built JS) in the `.mcpb`; use the `@anthropic-ai/mcpb` (`mcpb`) CLI to build/validate. Platform considerations.
4. **Verification** — manifest validity via the mcpb CLI is automatable; the `user_config` UI + provider injection can ONLY be confirmed by **actually installing the `.mcpb` in Claude Desktop** (manual E2E). Plan for that.

## First steps (suggested)
1. Re-read design doc §Host Usability Roadmap (esp. item 2 + item 4) and this handoff.
2. Research MCPB manifest format + build:
   - https://github.com/modelcontextprotocol/mcpb (manifest spec + CLI)
   - https://claude.com/docs/connectors/building/mcpb
   - (`.mcpb` is the renamed `.dxt`; manifest.json + `user_config`.)
3. Design: manifest.json (server launch + `ONTO_MCP_PROFILE=simple` + `user_config` fields) + the user_config→configure-provider wiring (decision #2) + packaging. **Present + confirm before building** (big slice, manual E2E, INV-CFG-1-sensitive bootstrap).
4. Implement smallest viable; run gates; review (subagent or onto); PR toward C.

## Process notes (learned this track)
- **Always branch from latest `main` in an isolated branch**; do NOT commit onto shared/parallel branches (item-2..item-1 work once got mixed into reconstruct PR #48 → had to split via `git worktree` cherry-pick + close #48). Memory: `[[worktree-isolation-on-parallel-agents]]`.
- **Diff-review targeting**: concurrent reconstruct commits keep landing on shared branches, so `HEAD^..HEAD` can point at the wrong diff. Use an explicit `<commit>^..<commit>` range for onto/subagent code review.
- Gates: `npm run check:ts-core` · `npx vitest run src/...` · `npm run check:spec-defaults` (G2) · `npm run check:import-boundary` (G1) · `npm run check:invariant-change -- origin/main` (G4) · `npm run check:mcp:review`.
- Commit footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. PR body footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Onto self-review of long-running reviews: poll the **canonical terminal signal** (`review-record.yaml` exists, or `onto_review_read` lifecycle) — NOT raw `execution-result.yaml` (upserted mid-run, false-terminal).

## Key files
- `src/core-runtime/onboard/configure-provider.ts` (+ `.test.ts`) — the input channel item 4 wires to.
- `src/core-runtime/onboard/register.ts` — host-config writer (reference).
- `src/mcp/server.ts` — `resolveToolProfile` / `advertisedToolDefinitions` (`ONTO_MCP_PROFILE`), `review-sync-window`.
- `src/core-runtime/discovery/settings-chain.ts` — settings seats/authority + `readSettingsAt` (validator).
- `bin/onto`, `package.json` (build/bin), `docs/architecture/mcp-native-tool-surface.md`, `INVARIANTS.md`.
