# Review Runtime Settings + Domain/Axiology Context Plan

> Status: Draft, strengthened after four onto reviews, runtime/MCP failure slice implemented
> Review runs: `domain=none`, `domain=software-engineering`, `domain=llm-native-development`, strengthened-plan `domain=software-engineering`, re-review `.onto/review/20260523-47cf305e`
> Goal: make review execution MCP-native, context-isolated, fail-loud, and simple enough to implement safely.

## 1. Consolidated Conclusion

The plan direction is accepted, but implementation must start with runtime-owned
contracts rather than behavior wiring.

Accepted direction:

- `.onto/settings.json` is the only canonical runtime settings seat.
- `review` runs through the TS runtime and is exposed through MCP-facing tools.
- The canonical review path uses 9 isolated lens units, controlled deliberation,
  and synthesize.
- Domain context and review value-alignment criteria are fixed per session before
  lens dispatch.
- Synthesize integrates downstream artifacts conservatively. It does not invent
  new criteria, reinterpret raw domain documents, or widen context.
- Retired config and legacy inputs fail loudly. No compatibility shims or hidden
  fallbacks are added to the canonical path.

Blocking contracts:

- actor LLM routing needs a resolved invocation-profile artifact.
- actor profile identity and consumer identity need a registry or binding layer.
- domain registry and review value-alignment dispatch gates must precede context
  manifest and packet generation.
- context manifest needs schema, lifecycle, validation, trace, and consumer
  rules.
- context eligibility needs one authority; derived matrices must not become a
  second source of truth.
- fail-loud behavior needs a common envelope plus phase-specific details.
- MCP execution, observability, idempotency, and disclosure need a stable
  contract surface.
- retired user config must be separated from runtime-derived coordination facts.

Latest validation result:

- `.onto/review/20260523-47cf305e` accepted the direction but kept four
  current blockers: pre-manifest failure/lifecycle boundary, bounded
  value-alignment dispatch, manifest/packet freshness boundary, and lens
  completion worker barrier.
- The first implementation slice now addresses those blockers at the runtime
  artifact level: actor profile and consumer binding artifacts, domain binding,
  review value-alignment criteria, review context manifest with packet hashes,
  structured domain-binding failure records, and a lens completion barrier.
- The second implementation slice connects the five pre-dispatch contracts to
  runtime validation and MCP-visible failure surfaces: ambiguous value criteria
  block before manifest creation, manifest/packet provenance is checked before
  lens dispatch, retired config files and retired review flags return structured
  failure envelopes, and review/status/result surfaces expose failure refs.
- The third implementation slice closes the remaining runtime contract gaps:
  explicit value-alignment confirmation allows dispatch with provenance,
  manifest schema/matrix/context eligibility drift fails before lens dispatch,
  direct-call actor routes preflight model/credential/local URL before dispatch,
  MCP session reads enforce project disclosure boundaries, and
  `review-run-manifest.yaml` records execution step ids, resume token, and
  session-id idempotency policy.
- Remaining work is limited to future product expansion such as malformed-output
  repair UX, artifact-write recovery policy, explicit resume tooling, and live
  provider quality conformance.
- The five pre-dispatch contracts are now closed in
  `.onto/processes/review/pre-dispatch-contracts.md`: failure/lifecycle phase
  boundary, value-alignment dispatch gate, manifest/packet phase boundary,
  lens completion barrier, and retired entry policy.

## 2. Non-Negotiable Criteria

- Each lens is a context-isolated reasoning unit.
- Each lens receives only contract-approved prompt packet context.
- Deliberation happens between lenses with differing or conditionally narrowed
  positions, under teamlead control.
- Every raised issue preserves each lens stance, including agreement,
  disagreement, narrowed agreement, and no-material-conflict decisions.
- Finding clusters are grouped by root problem, not treated as isolated surface
  findings.
- Final output is structured for screen reading and points to durable artifacts.
- Artifact truth is preserved by session files, not by main-context memory.
- A phase must not require an artifact that cannot exist yet. Pre-manifest
  failures are recorded independently of the manifest.
- The canonical path fails loudly on invalid settings, invalid domain binding,
  stale context, unsupported schema, malformed output, retired config, provider
  route failure, security disclosure violation, or missing required artifacts.

## 3. Canonical Runtime Artifacts

### 3.1 Resolved Actor Invocation Profile

Create during preparation:

`{session_root}/execution-preparation/actor-invocation-profiles.yaml`

Purpose:

- Normalize root and actor-specific LLM settings once before dispatch.
- Make preview, dispatch, deliberation, synthesize, MCP conformance, and tests
  consume the same resolved actor profile.
- Avoid live dependency on mutable root settings during execution.

Required actor profiles:

- `teamlead`
- `lens`
- `deliberation`
- `synthesize`

Required fields:

- `actor_profile_id`
- `actor_kind`
- `seat`
- `auth`
- `provider`
- `model`
- `effort`
- `service_tier`
- `base_url`
- `worker_executor`
- `credential_ref`
- `credential_serialization_policy`
- `route_unavailable_policy`
- `capability_requirements`
- `source_settings_refs`

Rules:

- `"inherit"` means the actor uses root `llm` exactly.
- An actor `llm` object without `auth` and `provider` overlays root `llm`.
- An actor `llm` object with `auth` or `provider` is an explicit actor route.
- Provider-specific fields are preserved only when they are valid for the
  selected provider and auth mode.
- Secrets are never serialized. Only credential references are serialized.
- Default route unavailable behavior is fail-before-dispatch.
- Fallback is not part of the canonical path. A future fallback path must be
  explicit, visible in the resolved profile, and surfaced through MCP output.

### 3.2 Actor And Consumer Binding Registry

Create during preparation:

`{session_root}/execution-preparation/actor-consumer-bindings.yaml`

Purpose:

- Keep actor profile identity separate from consumer identity.
- Give dispatch, context access, preview, deliberation, synthesize, and MCP
  output one stable namespace.

Required fields:

- `actor_profile_id`
- `actor_kind`
- `actor_instance_id`
- `consumer_id`
- `consumer_kind`
- `lens_id`
- `applies_to`
- `profile_ref`
- `context_access_ref`
- `extension_admission_status`

Rules:

- The `lens` actor profile may bind to many `lens:<lens_id>` consumers.
- `axiology` is a consumer even when it uses the lens execution profile.
- `deliberation:<lens_id>` is separate from `lens:<lens_id>`.
- Future consumers must be admitted here before receiving context or invocation
  capability.

### 3.3 Domain Registry And Binding

Domain selection chain:

1. explicit invocation domain
2. project settings default
3. `"none"`

Create before the context manifest:

`{session_root}/execution-preparation/domain-binding.yaml`

Required behavior:

- domain ids are validated against `.onto/domains/*`.
- `"none"` is a real runtime sentinel, not an alias to an empty directory.
- required and optional docs are declared by domain.
- missing required docs fail before manifest creation.
- optional docs are recorded with status.
- selected domain docs are hashed and packet materialization is traceable.
- invalid domain defaults and explicit invalid domains fail before packet
  generation.

Domain-specific problem framing:

- `software-engineering` has a problem framing profile and produces useful
  domain axes.
- `llm-native-development` currently has no problem framing profile, so domain
  axes are empty even though domain docs are consumed.
- Add `.onto/domains/llm-native-development/problem_framing_profile.md` later if
  LLM-native issue axes are needed.

### 3.4 Review Value-Alignment Criteria

Use `review value-alignment criteria`, not generic `alignment criteria`.

Create before the context manifest:

`{session_root}/execution-preparation/review-value-alignment-criteria.yaml`

Required per-criterion fields:

- `criterion_id`
- `statement`
- `source_kind`
- `source_ref`
- `authority_rank`
- `inference_owner`
- `confidence`
- `confidence_basis`
- `confirmation_status`
- `ambiguity_status`
- `conflict_status`
- `lifecycle_state`
- `lineage_ref`
- `dispatch_decision`

Lifecycle states:

- `inferred`
- `pending_confirmation`
- `confirmed`
- `revised`
- `contested`
- `insufficient`
- `blocked`
- `invalidated`

Dispatch decision table:

- `confirmed` + no ambiguity + no conflict -> `allow_dispatch`
- `pending_confirmation` -> `block_for_confirmation`
- `contested` -> `block_for_revision`
- `insufficient` -> `block_for_more_context`
- `blocked` -> `halt`
- `invalidated` -> `regenerate_or_cancel`

Rules:

- User intent is final authority.
- LLM-inferred value commitments cannot become dispatch authority when
  confidence is low, ambiguity is material, or canonical authority conflicts.
- Review dispatch stops for user confirmation when confirmation is required.
- Axiology consumes review value-alignment criteria as primary grounding.
- Synthesize may cite axiology output and provenance but must not create new
  criteria.

### 3.5 Review Context Manifest

Create only after domain binding, value-alignment dispatch gate, actor-consumer
bindings, and context eligibility validate:

`{session_root}/execution-preparation/review-context-manifest.yaml`

Purpose:

- Bind selected domain context and review value-alignment context for this
  session.
- Define the context each consumer may receive.
- Provide provenance and hash evidence for prompt packets and final records.

The manifest is a binding/provenance artifact, not a hidden reasoning stage and
not a content warehouse. Prompt packets are the delivered-context snapshots.

Required fields:

- `schema_version`
- `producer`
- `producer_version`
- `settings_schema_version`
- `domain_registry_version`
- `alignment_contract_version`
- `lifecycle_state`
- `session_id`
- `target_refs`
- `domain_binding_ref`
- `review_value_alignment_criteria_ref`
- `actor_consumer_bindings_ref`
- `context_sources`
- `derived_context_access_matrix`
- `packet_refs`
- `validation_results`
- `failure_record_refs`

Lifecycle states:

- `created`
- `validated`
- `blocked`
- `dispatched`
- `completed`
- `invalidated`

Transition rules:

- `created -> validated` only after all pre-manifest contracts validate.
- `created -> blocked` when a required pre-dispatch contract fails.
- `validated -> dispatched` only after packet refs and hashes are written.
- `dispatched -> completed` only after review record and final output are
  written.
- `validated|dispatched -> invalidated` when source hash, schema version,
  consumer eligibility, or packet provenance becomes invalid.
- Pre-manifest failures write standalone failure records and do not require a
  valid manifest.

Freshness policy:

- Preparation records file paths and hashes.
- Prompt packets materialize the actual delivered context.
- Resume verifies manifest and source hashes before reuse.
- Hash mismatch, missing required source, unsupported schema, unknown consumer,
  or raw-doc widening fails loudly.

### 3.6 Context Access Model

Use one canonical relation:

`context_sources[].allowed_consumers`

Valid consumers:

- `teamlead`
- `lens:<lens_id>`
- `axiology`
- `deliberation:<lens_id>`
- `controlled-deliberation`
- `synthesize`
- `final-output`
- `review-record`

Derived views:

- stage allowlists
- lens packet refs
- preview summaries
- MCP response refs
- final output refs
- `derived_context_access_matrix`

Rules:

- `context_sources[].allowed_consumers` is the sole eligibility authority.
- Any matrix is derived, explicitly named as derived, and validated against the
  canonical relation.
- A mismatch fails loudly before packet generation.
- Every packet and downstream artifact records `context_manifest_ref`,
  `context_manifest_hash`, `packet_ref`, `packet_hash`,
  `consumed_context_refs`, `forbidden_context_refs`, and `consumer_id`.

### 3.7 Structured Failure Record

Create one common failure envelope plus phase-specific detail records.

Required envelope fields:

- `phase`
- `reason_code`
- `human_message`
- `required_user_action`
- `retry_safety`
- `artifact_trust`
- `dispatch_state`
- `artifact_refs`
- `mcp_error_code`
- `details_kind`
- `details`

Phase-specific detail kinds:

- `settings_validation`
- `retired_config`
- `domain_binding`
- `value_alignment_gate`
- `actor_route`
- `manifest_lifecycle`
- `context_eligibility`
- `provider_api`
- `malformed_output`
- `schema_validation`
- `artifact_write`
- `security_disclosure`

Rules:

- Provider and actor fields exist only in details where they are true.
- Nulls or sentinels are allowed only when explicitly defined per detail kind.
- Pre-manifest failures write standalone failure records under
  `{session_root}/failures/`.
- CLI, MCP, and review record surfaces read the same envelope and details.

### 3.8 MCP Execution Contract

Define before claiming production-ready review behavior.

Required fields:

- `execution_step_id`
- `step_state`
- `entry_artifacts`
- `exit_artifacts`
- `progress_index`
- `progress_total`
- `request_schema_version`
- `response_schema_version`
- `artifact_ref_schema_version`
- `resume_token`
- `compatibility_policy`
- `failure_record_ref`

Rules:

- The 12-step progress model is a derived presentation of this contract.
- `review_status`, `review_result`, and `review` responses use the same artifact
  ref schema.
- Resume/status continuity is tested with fixtures.

### 3.9 Observability, Idempotency, And Security

Observability and idempotency are runtime contracts, not only log formatting.

Required execution evidence:

- `correlation_id`
- `attempt_id`
- `idempotency_key`
- `unit_id`
- `unit_kind`
- `transition`
- `started_at`
- `completed_at`
- `artifact_write_mode`
- `atomic_write_status`
- `duplicate_dispatch_detected`
- `retry_source_attempt_id`

Security and disclosure rules:

- Credential references are schema-level redacted invariants, not per-profile
  optional data.
- MCP responses disclose only allowed artifact refs and bounded summaries.
- Artifact sensitivity is recorded.
- Unauthorized artifact reads fail with `security_disclosure` failure details.
- Provider credentials are resolved by the host/runtime boundary and never by
  prompt content.

## 4. Implementation Plan

Implemented runtime slice on 2026-05-23:

- `actor-invocation-profiles.yaml` is written during bootstrap for teamlead,
  lens, deliberation, and synthesize actors.
- `actor-consumer-bindings.yaml` admits teamlead, each lens consumer, axiology,
  each deliberation consumer, controlled deliberation, and synthesize.
- `domain-binding.yaml` validates selected domain docs before packet
  generation; missing domain directories or required docs write structured
  failure records and halt.
- `review-value-alignment-criteria.yaml` records the explicit invocation intent
  as the initial authority-aware criterion consumed by packets.
- `review-context-manifest.yaml` records context sources, hashes, canonical
  `allowed_consumers`, derived context matrix, packet refs, packet hashes, and
  lifecycle state.
- `lens-completion-barrier.yaml` records planned/completed/failed/missing lens
  sets and whether downstream issue/deliberation/synthesis stages may run.
- `execution-result.yaml` now records `observed_dispatch_width` and the lens
  completion barrier ref while still preserving existing execution result
  fields used by current consumers.

Verified with:

- `npm run check:ts-core`
- `npx vitest run src/core-runtime/review/materializers-effort-persist.test.ts src/core-runtime/review/review-execution-profile.test.ts`
- `ONTO_LLM_MOCK=1 npm run review:invoke -- development-records/plans/20260523-review-runtime-settings-domain-axiology-plan.md "Smoke test the review runtime pre-manifest contracts and lens completion barrier." --domain software-engineering --review-mode core-axis --no-watch`
- `npm run test:mcp:review`
- `npm run test:e2e`

Implemented runtime/MCP validation slice on 2026-05-24:

- Common structured failure envelopes are created through
  `src/core-runtime/review/failure-records.ts`.
- Domain binding, review value-alignment gates, manifest lifecycle validation,
  context eligibility validation, retired config files, and retired review flags
  use the common failure shape.
- `review-value-alignment-criteria.yaml` blocks dispatch when ambiguity requires
  user confirmation before manifest creation.
- `run-review-prompt-execution.ts` validates manifest lifecycle, context source
  hashes, packet refs, packet consumers, packet hashes, consumed context refs,
  and forbidden context refs before any lens worker is dispatched.
- MCP errors expose structured runtime failures through
  `structuredContent.failure`.
- `review_status`, `review_result`, and `review` expose expanded artifact refs
  and failure refs.
- MCP conformance now asserts retired config file failures as structured
  failures.
- E2E now covers value-alignment block and packet hash mutation before dispatch.

Implemented remaining runtime/MCP contract closure on 2026-05-24:

- `--confirm-value-alignment` / MCP `confirmValueAlignment` records explicit
  user confirmation in `interpretation.yaml` and allows dispatch when ambiguity
  is acknowledged by the user.
- Manifest dispatch validation now rejects unsupported schema versions, derived
  access-matrix drift, packet hash drift, and consumed/forbidden context ref
  drift before any lens worker is dispatched.
- Direct-call routes preflight actor model, API key environment variables
  including custom `api_key_env`, and LM Studio base URL shape before dispatch.
- MCP `review_status` / `review_result` validate that `sessionRoot` is under
  the selected project `.onto/review/` boundary; violations return
  `security_disclosure` structured failures.
- `review-run-manifest.yaml` records canonical execution step ids, progress
  total, resume token, session-id idempotency key, and duplicate-dispatch
  policy.
- E2E now covers value-confirmed allow-path, provider route preflight, manifest
  schema mismatch, derived matrix mismatch, and forbidden-context ref mismatch.
- MCP conformance now covers execution contract fields and security-disclosure
  failure output.

Verified with:

- `npm run check:ts-core`
- `npx vitest run src/core-runtime/review/materializers-effort-persist.test.ts src/core-runtime/review/review-execution-profile.test.ts src/core-runtime/discovery/settings-chain.test.ts`
- `npm run test:mcp:review`
- `npm run test:e2e`

### Phase 0: Retired Input And Dispatch Width Boundary

Separate retired user-facing config from runtime-derived coordination fields.

Tasks:

- Reject `max_concurrent_lenses` and other retired user settings during settings
  load or binding.
- Preserve internal `dispatch_width = selected_lens_ids.length`.
- Use `observed_dispatch_width` for runtime output.
- Reserve legacy names only for rejected-key diagnostics.
- Add tests proving retired user config fails while runtime parallel dispatch
  still uses all selected lenses.

Done when:

- retired config input fails loudly.
- full review still dispatches all selected lenses in parallel.
- no compatibility shim is introduced.

Current status:

- Implemented for retired `max_concurrent_lenses`, retired invocation flags, and
  retired `config.yml` / `config.yaml` files.
- MCP conformance verifies structured retired config failure output.

### Phase 1: Pre-Manifest Contract Closure

Define the contracts that manifest and packet generation depend on.

Tasks:

- Define actor invocation profile schema.
- Define actor-consumer binding registry schema.
- Define minimum domain registry and domain binding schema.
- Define review value-alignment criteria artifact and dispatch decision table.
- Define structured failure envelope and pre-manifest failure behavior.

Done when:

- invalid settings, actor route, domain binding, and value-alignment gates can
  fail before manifest creation.
- pre-manifest failures write standalone failure records.
- contract fixtures validate without generating prompt packets.

Current status:

- Domain binding and ambiguous value-alignment gates fail before manifest
  creation with standalone structured failure records.
- Explicit user confirmation allows ambiguous criteria to dispatch with
  confirmation provenance.
- Actor route and settings validation use the narrowed settings/profile path;
  route-unavailable failures are structured before dispatch.

### Phase 2: Manifest Lifecycle And Context Eligibility

Tasks:

- Define manifest lifecycle transitions and validator ownership.
- Make `context_sources[].allowed_consumers` the sole eligibility authority.
- Rename matrix output to `derived_context_access_matrix`.
- Validate derived views against canonical eligibility.
- Add source hash, schema version, and resume invalidation rules.

Done when:

- manifest creation cannot depend on missing pre-manifest artifacts.
- context matrix mismatch fails loudly.
- hash mismatch and unsupported schema block dispatch.

Current status:

- Run dispatch validates manifest lifecycle, source hashes, packet refs, packet
  consumers, packet hashes, schema version, derived matrix, consumed refs, and
  forbidden refs before lens execution.
- E2E covers packet hash mutation, unsupported schema, derived matrix mismatch,
  and forbidden-context ref mismatch before dispatch.

### Phase 3: Packet Generation And Review Runtime Integration

Tasks:

- Generate prompt packets only from validated domain binding, value criteria,
  actor-consumer bindings, and context manifest.
- Record packet hashes and consumed refs.
- Make lens, axiology, deliberation, and synthesize consume only allowed packet
  context and downstream artifacts.
- Make synthesize use the resolved xhigh profile when configured.

Done when:

- lens packets contain only manifest-approved refs or excerpts.
- downstream artifacts prove consumed refs.
- synthesize has no raw domain-doc path unless explicitly allowed by manifest.

Current status:

- Packet refs and hashes are recorded in the manifest and validated at dispatch.
- Selected lens completion barrier must pass before synthesize.
- Context eligibility drift is fixture-tested before dispatch.

### Phase 4: MCP Execution, UX, Observability, And Security

Tasks:

- Define MCP request, response, status, result, artifact ref, and failure schemas.
- Derive the 12-step progress view from execution-step state.
- Add durable events, attempts, correlation ids, idempotency keys, retry trails,
  duplicate dispatch detection, and atomic artifact write rules.
- Add artifact sensitivity, MCP disclosure limits, credential reference
  invariants, and unauthorized artifact read failures.
- Ensure CLI output and MCP output read the same bounded runtime facts.

Done when:

- screen output is understandable without opening raw artifacts.
- MCP responses expose stable artifact refs and failure records.
- resume/status continuity is fixture-tested.
- security disclosure behavior is testable.

Current status:

- MCP review/status/result expose artifact refs and failure refs.
- MCP error responses expose structured runtime failure content.
- MCP status/result enforce project-boundary disclosure.
- `review-run-manifest.yaml` exposes durable execution step ids, resume token,
  idempotency key, and duplicate-dispatch policy.

### Phase 5: Domain/Axiology Completion And Deprecation Cleanup

Tasks:

- Add missing domain doc validation and optional doc statuses.
- Add `llm-native-development` problem framing profile if domain-specific issue
  axes are needed.
- Ensure axiology packet always receives value criteria provenance.
- Fail loudly on `config.yml`, `config.yaml`, retired keys, retired invocation
  inputs, and legacy mode-setting authority.
- Keep old CLI topology outside the canonical MCP path.
- Remove or archive legacy docs that imply fallback or compatibility behavior.
- Avoid history logs in canonical runtime context; development history stays only
  under `development-records/`.

Done when:

- domain `none`, `software-engineering`, and `llm-native-development` all have
  deterministic binding behavior.
- value criteria that are uncertain or authority-sensitive block dispatch.
- canonical runtime has no silent fallback path.
- old inputs produce structured failure records.

Current status:

- Ambiguity blocks dispatch before manifest creation.
- Explicit user confirmation allows dispatch and records confirmation
  provenance.
- Retired config files and retired review flags produce structured failure
  records.
- Domain `none`, `software-engineering`, and `llm-native-development` binding
  behavior has been exercised in review runs.

## 5. Test And Verification Plan

Settings and actor profile tests:

- root `llm` plus actor `inherit`.
- actor partial overlay such as `synthesize.llm = { "effort": "xhigh" }`.
- explicit actor route with valid provider/auth.
- invalid actor route fails loudly.
- route unavailable fails before dispatch.
- secrets are redacted from artifacts.

Actor/consumer registry tests:

- one lens profile binds to multiple `lens:<lens_id>` consumers.
- axiology consumer is admitted and receives expected profile/context.
- deliberation consumers are separate from lens consumers.
- unknown future consumer fails before context access.

Domain and value-alignment tests:

- `domain=none`.
- `domain=software-engineering`.
- `domain=llm-native-development`.
- invalid domain id.
- missing required domain doc.
- high-confidence confirmed criteria dispatch.
- low-confidence inferred criteria block.
- ambiguity blocks.
- canonical authority conflict blocks.
- user confirmation updates criteria and allows dispatch.
- invalidated criteria force regeneration or cancellation.

Manifest and context tests:

- pre-manifest failure does not require manifest refs.
- hash mismatch on resume.
- unknown consumer in canonical eligibility relation.
- derived matrix mismatch.
- packet tries to consume forbidden context.
- unsupported manifest schema.

Runtime tests:

- all selected lenses dispatch in parallel.
- retired `max_concurrent_lenses` setting fails.
- runtime-derived `observed_dispatch_width` is still recorded.
- issue ledger groups findings by root problem.
- every issue has all lens stances.
- controlled deliberation records consensus, unresolved disagreement, narrowed
  agreement, or no-material-conflict.
- synthesize uses resolved xhigh profile when configured.
- retry records attempts and idempotency evidence.
- artifact writes are atomic or marked failed.

MCP and security tests:

- MCP review conformance exposes opening summary, progress, final summary, and
  artifact refs.
- structured failure envelope is returned for invalid settings, invalid domain,
  actor route failure, and schema validation failure.
- `review_status`, `review_result`, and `review` share artifact ref schema.
- unauthorized artifact ref disclosure is withheld.
- credential refs are redacted by schema invariant.
- `npm run check:ts-core`
- relevant Vitest suites for settings, execution profile, nested dispatch, MCP
  review conformance.
- `git diff --check`

## 6. Acceptance Criteria

- Review can run full-scale through Codex workers with 9 isolated lenses,
  controlled deliberation, and synthesize.
- The same target can be reviewed with `domain=none`,
  `domain=software-engineering`, and `domain=llm-native-development`.
- Domain and value-alignment gates are resolved before manifest and packet
  generation.
- Domain changes affect only bounded domain context and problem framing, not
  runtime safety.
- Actor model settings are inspectable through resolved actor profiles.
- Actor profiles and context consumers are linked by a stable binding registry.
- Context access is provable through manifest and packet refs.
- Value-alignment criteria are authority-aware, lineage-aware, and
  confirmation-aware.
- Retired config fails loudly while runtime-derived dispatch width remains
  available.
- MCP-facing output is concise, structured, artifact-backed, and disclosure-safe.

## 7. Open Follow-Ups

- Decide whether `llm-native-development` needs a domain-specific problem
  framing profile now or after review runtime stabilization.
- Decide whether future non-canonical alternate provider policies are ever
  allowed for provider route failure. Default remains fail-loud.
- After review stabilizes, design learn/govern integration separately.
