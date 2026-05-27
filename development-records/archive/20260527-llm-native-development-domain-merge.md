# LLM-Native Development Domain Merge

Date: 2026-05-27

`llm-native-development` was retired as a selectable review domain and merged into `software-engineering`.

Reason:

- Modern software engineering work frequently includes AI-assisted development, LLM-powered product behavior, agent workflows, prompt/context contracts, model/provider dependencies, and semantic evaluation.
- Running separate `software-engineering` and `llm-native-development` reviews created duplicated review cost and fragmented findings across two domain frames.

Current authority:

- Canonical selectable domain: `.onto/domains/software-engineering/`
- Compatibility alias: `llm-native-development` normalizes to `software-engineering` at runtime.
- LLM-native development principle authority remains `.onto/principles/llm-native-development-guideline.md`.

Transferred active substance:

- fail-loud over silent degradation
- model/provider/version boundaries
- prompt/context contracts
- retrieval and provenance expectations
- agent/tool/MCP boundaries
- semantic evaluation expectations
- LLM-specific production and failure diagnostics
