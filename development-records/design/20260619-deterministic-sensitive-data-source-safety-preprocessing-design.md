# Design — deterministic sensitive-data source-safety preprocessing (Track 2)

> Status: **design (scope-captured, awaiting detailed design + approval).** Separate track from the conservation structural remediation (`20260619-reconstruct-conservation-structural-remediation-design.md`, Track 1). Owner-defined scope (this session). Surfaced by the R2-3 code whole-capture change that newly projects secret-bearing files to the provider, but a distinct, orthogonal concern.

## 1. Goal & the scope boundary (owner decision)

**Goal**: a **deterministic** preprocessing step that removes/redacts high-exploit, deterministically-detectable sensitive data **before any source content enters the reconstruct pipeline** (observation → capture → prompt → at-rest artifact), so such data never reaches the LLM provider or the session artifacts.

**The governing distinction (owner-declared)** — what makes something in-scope is **(a) deterministic detectability + (b) clear exploit value / immediate privilege escalation**, NOT "is it personal":

| In scope (deterministic + high-exploit) | Out of scope |
|---|---|
| Secret-bearing **files**: `.env*`, `*.pem`, `*.key`, `id_rsa*`, `*credentials*`, `.npmrc`, `.git-credentials`, `*.p12`, `*.pfx`, … | **General PII** (names, addresses, free-form personal info): no deterministic format, high individual-judgment variance → remains the user's own concern, NOT ours (unchanged prior declaration). |
| **주민등록번호 (Korean RRN)** — validated by its checksum algorithm | |
| **SSN** — validated by format/issuance validation logic | |
| **여권번호 (passport)** — format-validated | |
| **결제카드번호 (payment card)** — **Luhn** checksum + adjacent **CVC** | |
| **명시적으로 선언된 ID/비밀번호** — `password=`/`secret=`/`token=`/`api_key=`/`id=` key=value declarations | |

**Why content-level redaction is in scope here (correcting an earlier mis-call)**: these identifiers have **validation/check logic** (RRN checksum, SSN validation, Luhn for cards), so detection is *deterministic*, not heuristic. That is exactly what distinguishes them from fuzzy PII. Removing a validated secret value is therefore a deterministic, owner-approved action — it is **not** the general "PII masking" that remains out of scope.

## 2. Mechanism — two deterministic layers

Both layers are **deterministic (regex + validation/checksum algorithms, never an LLM)** — aligns with the capability-boundary guideline (deterministic work → tools/code).

1. **File-level exclusion**: a blacklist of secret-bearing file patterns → matching files are **excluded whole** at the front of the pipeline (never observed/captured/projected/persisted). No content change → not redaction.
2. **Content-level validated-value redaction**: for non-excluded files, scan for the in-scope value patterns and, **only when the value passes its validation check** (RRN checksum, Luhn, SSN validation — to suppress false positives), **replace the matched value with a typed placeholder** (e.g. `[REDACTED:payment_card]`) before the content is read. The surrounding structure is preserved so the ontology can still be reconstructed from the non-secret parts.

## 3. Defaults, configuration, audit

- **Opt-in default (owner-declared)**: OFF unless enabled in `.onto/settings.json` (e.g. `sourceSafety.sensitiveDataFiltering`). When enabled, a sensible default pattern/validator set applies; the user configures which locale/format families (RRN=KR, SSN=US, …) and may extend the file/value lists.
- **Front of pipeline**: preprocessing runs before observation/capture, so removed/redacted data never reaches capture, prompt, OR the at-rest `source-observations.yaml`.
- **Auditable, not silent**: every file exclusion and value redaction is recorded deterministically in the **source-safety ledger** — by pattern KIND + count + location, **never the secret value itself**. A run that filtered N items says so.
- **Fail-safe posture**: when enabled, unknown/new extensions and unvalidated candidates default to the safe action; validation-gated redaction only removes confirmed matches (no over-removal of look-alikes that fail the checksum).

## 4. Concept-economy & boundary notes

- Reuses the existing **source-safety ledger / authorization** surface rather than inventing a new artifact; adds a deterministic-detector module (regex + validators) and the placeholder vocabulary.
- **Refines (does not fully reverse) the prior "masking out of scope" guardrail**: general-PII masking stays out; deterministic-validated high-exploit secret/identifier removal is now in, by explicit owner decision. Future sessions: the boundary is *deterministic detectability + exploit value*, not *is-it-personal*.

## 5. Relationship to Track 1 (conservation remediation)

- Track 1 keeps **M3(a) per-kind capture-size policy** (config/non-source kinds → bounded sample) as an **always-on quality + defense-in-depth baseline** — explicitly **not** claimed as secret-exposure closure (a small `.env` < 6K still projects whole under capture-size alone; the reviews confirmed this).
- **Full closure of the R2-3 secret-projection exposure is THIS track** (file exclusion + validated-value redaction). The two tracks proceed separately.

## 6. Open design questions (for the detailed-design stage)

- Placeholder format + whether the at-rest artifact stores the redacted form only (recommended: yes — never persist the original).
- Per-locale default validator set + `settings.json` schema (enable flags, custom patterns).
- Performance: streaming validated-scan over large files within the existing capture budget.
- Interaction with the existing source-safety `consumption_allowed` / visibility-tier logic (so the new filter composes with, not duplicates, the authorization axis).
- Test corpus of valid/invalid samples per pattern (checksum-passing vs look-alike-failing) for deterministic dual tests.

## 7. Next step

This document captures the owner-approved SCOPE. The detailed mechanism design (module layout, settings schema, validators, ledger entries, tests) follows on owner go-ahead. Track 1 (conservation) proceeds independently.
