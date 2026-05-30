# Source Profile: Document

> Target material kind: `document`

## Registry Record

Current profile id, contract status, runtime implementation status, schema
version, profile version, migration status, and definition hash are owned by
`.onto/processes/reconstruct/reconstruct-contract-registry.yaml#source_profile_records`.
This file defines document observation semantics only.

## Target Material Identification Hints

- File extension is `.md`, `.txt`, `.pdf`, `.docx`, or `.html`.
- Target is a URL or exported document.
- Text is structured as prose, policy, requirements, guide, report, or reference
  material rather than executable code.

## Module Inventory Unit

Section, heading, chapter, table, or referenced document.

## Structural Recognition Scope

- heading hierarchy
- body text samples
- references and citations
- definitions and glossary sections
- tables and lists
- cross-document references
- quoted requirements or policies

## Correct Observation Examples

> Section 3.2, `Payment Processing`, states that refunds are available only
> within seven days of payment.

> The definitions section defines `lesson` as a one-to-one session between an
> instructor and a student.

## Prohibited Interpretation Examples

> The core business rule of this document is the refund policy.

> This section defines the canonical ontology category.

## Detail Location Format

```text
{description} -- {file}:{section}
```

Example:

```text
refund deadline statement -- policy.md:Section 3.2
```

## Context Questions

- What is the document purpose: planning, policy, API documentation, user guide,
  report, or contract?
- Is there a system or service that this document describes?
- Is there an existing domain glossary?
- Is this document authoritative, advisory, historical, or draft?

## Scan Targets

- table of contents
- heading tree
- references and citations
- term definition section
- tables
- subsidiary document links
