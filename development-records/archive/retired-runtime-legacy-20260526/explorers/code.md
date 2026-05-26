# Explorer Profile: Codebase

## Exploration Tools
Glob, Grep, Read

## module_inventory Unit
Directory / Package

## Structural Recognition Scope
- File structure, import/require/include
- Class / function signatures
- Type definitions, interfaces
- Configuration files (package.json, build.gradle, Makefile, etc.)

## Source Type Identification Criteria
- Source code files (.py, .java, .ts, .go, etc.) exist in the directory
- Build configuration exists (package.json, pom.xml, Cargo.toml, etc.)

## Structural Recognition Examples

Correct reporting:
> "The Payment class has status, amount, and createdAt fields. PaymentGateway branches on status using string comparison."

Incorrect reporting:
> "Payment is an Aggregate Root, and PaymentGateway is a Domain Service."

## detail Location Format
`"{description} — {file}:{line}"`

Example: `"status field definition — Payment.java:42"`

## Phase 0.5 Context Questions
- "Can you describe the core business flow of this system in one sentence?"
- "Is there any legacy migration history?"
- "Are there related repositories (frontend, documentation, etc.)?"
- "Is there an existing domain glossary?"

## Phase 0.5 Scan Targets
- Directory structure
- README.md, CLAUDE.md
- Tests (`test/`, `__tests__/`, `spec/`)
- CI/CD (`.github/workflows/`)
- API specifications (`openapi.yml`, `swagger.json`)
- Infrastructure (`Dockerfile`, `k8s/`, `terraform/`)
