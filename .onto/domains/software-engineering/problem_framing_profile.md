---
version: 3
last_updated: "2026-05-27"
source: issue-stance-deliberation-contract
status: design_target
doc_type: custom:problem_framing_profile
---

# Software Engineering Domain — Problem Framing Profile

This profile defines software-engineering-specific axes for review closure problem framing.
It extends the common spine in `.onto/processes/review/issue-stance-deliberation-contract.md`.

The profile does not redefine common spine values.

## Domain Axes

### implementation_surface

Required when an issue affects a concrete software artifact, runtime path, or development workflow.

| Value | Meaning |
|---|---|
| `runtime_core` | TS core/runtime behavior |
| `review_runtime` | review process, prompts, artifacts, runner |
| `mcp_surface` | MCP tool schema/server boundary |
| `api_contract` | exported API, typed facade, request/response shape |
| `build_package_boundary` | build output, package exports, CLI entrypoint, distribution path |
| `test_verification` | tests, conformance checks, smoke checks, validation harness |
| `authority_docs` | `.onto` authority/process/principle docs used by runtime or agents |
| `developer_experience` | setup, commands, diagnostics, handoff ergonomics |
| `llm_agent_workflow` | LLM/agent orchestration, prompt/context assembly, tool use, or multi-agent coordination |
| `model_provider_boundary` | model/provider/version/auth/routing dependency boundary |
| `semantic_evaluation` | rubric, eval set, AI-as-judge, human review, or quality baseline |
| `failure_diagnostics` | fail-loud diagnostics, structured failure artifacts, observability, or degraded-state surfacing |
| `output_sink_boundary` | shell, SQL, HTML, file, email, API/tool, or authority-artifact sink that consumes generated or external output |
| `rag_retrieval_boundary` | retrieval, embedding index, corpus, permission filter, source validation, or retrieval audit |
| `ai_governance` | AI risk owner, approval gate, human oversight, incident disclosure, red-team/eval loop, or governance evidence |
| `provenance_artifact` | source refs, builder/agent, input set, transformation path, verification state, or generated-artifact trust status |
| `future_work` | reconstruct, evolve, learn, govern, or later product area |

### defect_kind

Required when the issue can be expressed as a software-development problem type.

| Value | Meaning |
|---|---|
| `logic_bug` | implemented behavior is internally wrong |
| `contract_gap` | document, schema, or artifact seat is insufficient for deterministic implementation |
| `stale_authority_text` | active authority wording diverges from current runtime or product direction |
| `boundary_mismatch` | ownership, package, API, or runtime boundary is ambiguous or inconsistent |
| `integration_failure` | independently valid parts do not compose into the intended path |
| `verification_gap` | implementation or contract lacks a reliable check |
| `observability_gap` | failure or state cannot be inspected well enough to operate or debug |
| `silent_degradation` | fallback, repair, or graceful degradation hides the origin, trust loss, or incomplete behavior |
| `semantic_quality_gap` | route/schema succeeds but usefulness, faithfulness, or output quality is unproven or degraded |
| `output_trust_gap` | LLM/generated output reaches a downstream sink without sink-specific validation, encoding, authorization, provenance, or trust classification |
| `prompt_injection_boundary_gap` | external content can override role, tool, permission, output, disclosure, or authority rules |
| `rag_permission_gap` | retrieved material can cross permission, tenant, source-trust, or provenance boundaries before context injection |
| `agency_overreach` | agent functionality, permission, or autonomy is broader than the task/risk justifies |
| `provenance_gap` | authority-affecting generated/retrieved artifacts cannot be traced to source, builder, inputs, transformation path, and verification state |
| `governance_gap` | material AI risk lacks owner, approval/acceptance gate, human oversight, incident path, or improvement loop |
| `value_tradeoff_gap` | a local optimization hides or distorts stakeholder value, user/operator agency, accessibility, diagnosability, accountability, or artifact truth |
| `quality_debt` | issue increases maintenance, drift, or coordination cost without immediate breakage |
| `implementation_task` | design is sufficiently closed and can move to build work |

### verification_need

Optional. Use when the next useful evidence path matters to closure.

| Value | Meaning |
|---|---|
| `schema_validation` | parser or schema check should validate the artifact shape |
| `unit_test` | focused behavior test should cover the issue |
| `integration_smoke` | end-to-end or cross-module smoke check is needed |
| `semantic_eval` | rubric/golden-set or pairwise model/agent output evidence is needed |
| `failure_artifact_smoke` | a fail-loud or degraded-state artifact should prove the failure remains diagnosable |
| `package_install_smoke` | packaged install or executable path must be verified |
| `provider_conformance` | provider-specific behavior needs a conformance check |
| `sink_validation_smoke` | downstream sink validation/encoding/authorization should be exercised with generated or hostile input |
| `prompt_injection_redteam` | hostile external-content scenario should verify instruction hierarchy and exfiltration boundaries |
| `rag_permission_smoke` | retrieval should prove permission filtering, source provenance, poisoning control, and audit refs |
| `provenance_audit` | artifact or claim provenance should be traced through source, builder/agent, input set, transformation, and verification state |
| `governance_review` | risk owner, risk treatment, approval gate, incident path, and continuous-improvement loop should be reviewed |
| `human_design_decision` | maintainer/user decision is the next verification gate |

## Rules

1. `implementation_surface` and `defect_kind` may be omitted only when the issue is outside software-development substance.
2. `stale_authority_text` must be paired with `implementation_surface` or an explicit rationale explaining that runtime behavior is unaffected.
3. `implementation_task` is not a fix proposal; it means the issue is framed well enough to become implementation input.
4. `future_work` should be used when an issue belongs to reconstruct, evolve, learn, govern, or another planned capability rather than the current review path.
5. `value_tradeoff_gap` must explain which value commitment is affected: diagnosability, artifact truth, accountability, evidence, explicit loss, least agency, governance, accessibility, or user/operator agency.
6. `governance_gap` should not be downgraded to documentation-only when AI behavior affects release, security/privacy, user decisions, or authority artifacts.
7. `output_trust_gap`, `prompt_injection_boundary_gap`, and `rag_permission_gap` should prefer fail-close plus fail-loud closure unless the product explicitly accepts visible degraded behavior.
