# Vendored tree-sitter grammar wasm

Prebuilt tree-sitter WASM grammars that are **not** shipped by `@vscode/tree-sitter-wasm`
(the bundle behind the built-in TS/JS/Python/Go/Rust/… observers). Vendored — rather than
added as an npm dependency — because the upstream grammar packages declare heavy, unrelated
**runtime** dependencies (e.g. `@tree-sitter-grammars/tree-sitter-kotlin` pulls
`npm-check-updates` into `dependencies`), which would bloat every install of the published
`onto-mcp` package. Only the single wasm artifact is needed at runtime, so we vendor it —
the same pattern used for `vendor/linguist/`, yielding a self-contained grammar identical in
spirit to the `@vscode/tree-sitter-wasm` bundled ones.

The observer folds each grammar wasm's sha256 into `extractor_logic_sha256`, so replacing a
wasm here deterministically rotates the affected language's reuse key.

## tree-sitter-kotlin.wasm

| | |
|---|---|
| Source package | `@tree-sitter-grammars/tree-sitter-kotlin` |
| Version | `1.1.0` (npm) |
| File | `package/tree-sitter-kotlin.wasm` from the npm tarball |
| sha256 | `7009d69453bc8735e438b2818a633efb21c88f99782769abba60dffedfab73f7` |
| License | MIT — see `LICENSE-tree-sitter-kotlin` |
| ABI | Loads under `web-tree-sitter@0.26.11` (verified) |

To update: `npm pack @tree-sitter-grammars/tree-sitter-kotlin@<version>`, extract
`package/tree-sitter-kotlin.wasm`, replace the file here, and update the version + sha256
above. Re-run the observer's Kotlin fixtures — a grammar version bump can change node-type
names and break the `KOTLIN_KIND` mapping.
