# Source Profile: Code

> Target material kind: `code`

## Registry Record

Current profile id, contract status, runtime implementation status, schema
version, profile version, migration status, and definition hash are owned by
`.onto/processes/reconstruct/reconstruct-contract-registry.yaml#source_profile_records`.
This file defines code observation semantics only.

## Target Material Identification Hints

- Source code files such as `.ts`, `.js`, `.py`, `.java`, `.go`, `.rs`, or `.rb`
  exist in the target.
- Build or package configuration exists, such as `package.json`, `pom.xml`,
  `Cargo.toml`, `go.mod`, `Makefile`, or `Dockerfile`.
- Tests, API specs, or CI configuration reference the target code.

## Module Inventory Unit

Directory, package, module, or service boundary.

## Structural Recognition Scope

- File structure
- imports, requires, or includes
- class, function, method, and type signatures
- interfaces and type definitions
- configuration files
- test files and fixtures
- API or schema definitions

## Correct Observation Examples

> The `Payment` class has `status`, `amount`, and `createdAt` fields at
> `src/payment.ts:14`.

> `PaymentGateway` branches on `status` with string comparison at
> `src/payment-gateway.ts:42`.

## Prohibited Interpretation Examples

> `Payment` is an Aggregate Root.

> `PaymentGateway` is a Domain Service.

## Detail Location Format

```text
{description} -- {file}:{line}
```

Example:

```text
status field definition -- src/payment.ts:14
```

## Context Questions

- What user-visible workflow does this code support?
- Is this code a service, library, script, UI, integration, or test harness?
- Are there related repositories or documents that define the domain language?
- Is there a compatibility or migration constraint?

## Purpose Evidence Cues

- README, package metadata, product copy, or top-level docs
- default route, first screen, CLI command, public API, or integration entrypoint
- quickstart, sample request, fixture, E2E test, or smoke test
- central domain objects, route/controller clusters, schema definitions, or
  state models
- configuration that declares target users, deployment mode, or runtime role

## Purpose Adequacy Facet Guidance

Common code facets include:

- product or service surface
- actor, principal, or external caller
- action, command, API operation, or event
- target object, state, or lifecycle transition
- permission, policy, validation, or failure behavior
- read/write data binding and provenance
- external system or interface boundary

These facets are guidance, not a closed enum. If a code target exposes a
source-backed facet outside this list, record it in the
`PurposeAdequacyFrame` with evidence and promote it to this profile only after
the pattern is stable across real-source runs.

## Scan Targets

- directory structure
- `README.md`, `AGENTS.md`, `CLAUDE.md`
- tests: `test/`, `tests/`, `__tests__/`, `spec/`
- CI/CD: `.github/workflows/`
- API specifications: `openapi.yml`, `openapi.yaml`, `swagger.json`
- infrastructure: `Dockerfile`, `k8s/`, `terraform/`
- package/build config
