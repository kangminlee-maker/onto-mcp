# Source Profile: Code

> Target material kind: `code`

## Support Status

Design profile only. Runtime adapter support is not wired in the current repo.

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
- Is there a legacy migration or compatibility constraint?

## Scan Targets

- directory structure
- `README.md`, `AGENTS.md`, `CLAUDE.md`
- tests: `test/`, `tests/`, `__tests__/`, `spec/`
- CI/CD: `.github/workflows/`
- API specifications: `openapi.yml`, `openapi.yaml`, `swagger.json`
- infrastructure: `Dockerfile`, `k8s/`, `terraform/`
- package/build config
