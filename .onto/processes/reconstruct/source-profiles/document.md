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

## Purpose Evidence Cues

- title, subtitle, introduction, abstract, executive summary, or conclusion
- audience statement, owner, status, effective date, or authority marker
- decision records, action requests, policy statements, requirements, or claims
- tables, lists, callouts, references, citations, and definitions
- open questions, risks, unresolved decisions, or follow-up sections

Meeting records are handled as document material unless a future dedicated
material kind is introduced. Useful meeting-record cues include agenda,
participants, decisions, action items, owners, due dates, rationale, and
unresolved topics.

## Purpose Adequacy Facet Guidance

Common document facets include:

- audience or stakeholder
- subject, thesis, claim, policy, decision, or request
- evidence, citation, rationale, or source reference
- obligation, action item, owner, due date, or acceptance criterion
- authority, status, timeline, or scope boundary
- unresolved topic, risk, exception, or limitation

These facets are guidance, not a closed enum. Do not force documents or meeting
records into a workflow. If a document exposes a source-backed facet outside
this list, record it in the `PurposeAdequacyFrame` with evidence and promote it
to this profile only after repeated real-source runs justify the refinement.

## Scan Targets

- table of contents
- heading tree
- references and citations
- term definition section
- tables
- subsidiary document links
