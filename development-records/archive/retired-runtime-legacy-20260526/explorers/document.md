# Explorer Profile: Document

## Exploration Tools
Read, WebFetch

## module_inventory Unit
Section / Chapter

## Structural Recognition Scope
- Heading hierarchy (H1-H6 or equivalent structure)
- Body content
- References/citations (other documents, external URLs)
- Term definitions
- Tables, lists
- Subsidiary document references

## Source Type Identification Criteria
- File extension: .md, .txt, .pdf, .docx, .html
- $ARGUMENTS is a URL (web document)
- Text file that is not a code file

## Structural Recognition Examples

Correct reporting:
> "Section 3.2 'Payment Processing' contains the statement: 'Refunds are only available within 7 days of payment.'"

> "The term definition section defines 'lesson' as 'a 1:1 session between an instructor and a student.'"

Incorrect reporting:
> "The core business rule of this document is the refund policy."

## detail Location Format
`"{description} — {file}:{section}"`

Example: `"Refund deadline definition — policy.md:Section 3.2"`

## Phase 0.5 Context Questions
- "What is the purpose of this document? (planning document, policy document, API documentation, user guide)"
- "Is there a system/service that this document describes?"
- "Is there an existing domain glossary?"

## Phase 0.5 Scan Targets
- Table of contents structure
- Reference/citation list
- Presence of subsidiary documents
- Presence of term definition section
