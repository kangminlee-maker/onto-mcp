# Source Profile: Spreadsheet

> Target material kind: `spreadsheet`

## Registry Record

Current profile id, contract status, runtime implementation status, schema
version, profile version, migration status, and definition hash are owned by
`.onto/processes/reconstruct/reconstruct-contract-registry.yaml#source_profile_records`.
This file defines spreadsheet observation semantics only.

## Target Material Identification Hints

- File extension is `.xlsx`, `.csv`, `.xls`, or `.ods`.
- MIME type indicates a spreadsheet workbook.
- User identifies the target as a spreadsheet, workbook, sheet, model, report, or
  accounting file.

## Module Inventory Unit

Workbook, sheet, named range, table, or used range.

## Structural Recognition Scope

- cell values
- formulas and formula references
- formatting such as background color, font, borders, and merged cells
- cross-sheet references
- data validation rules
- named ranges
- hidden rows and columns
- macros or VBA presence

## Correct Observation Examples

> Cells `A1:F1` are merged with background color `#4472C4`, bold font, and
> formatting different from the rows below.

> Cell `B2` contains `=VLOOKUP(A2, Sheet2!A:C, 3, FALSE)` and references columns
> `A:C` of `Sheet2`.

## Prohibited Interpretation Examples

> `A1:F1` is a table header.

> This sheet is a sales report.

> The formula is a cost-recognition policy.

## Detail Location Format

```text
{description} -- {sheet}:{cell range}
```

Example:

```text
formula =SUM(B2:B10) -- Sheet1:B11
```

## Context Questions

- What is the primary purpose of this file: report, data collection, calculation
  model, dashboard, accounting schedule, or another use?
- Do colors or formatting have special meaning?
- Who primarily uses this file?
- Is there an existing domain glossary or accounting policy reference?

## Purpose Evidence Cues

- workbook title, sheet names, summary sheet, dashboard sheet, or cover sheet
- input regions, named ranges, data validation, and editable cells
- formulas, cross-sheet references, lookup tables, and calculation outputs
- output cells, totals, variance columns, decision cells, or review markers
- assumptions, notes, source-data tabs, external data connections, or refresh
  metadata

## Purpose Adequacy Facet Guidance

Common spreadsheet facets include:

- workbook purpose and primary consumer
- input data, assumptions, and source data
- calculation, formula dependency, lookup, or transformation
- output, decision cell, report section, or dashboard view
- control, validation, review, or approval marker
- provenance, refresh boundary, external connection, or manual edit boundary

These facets are guidance, not a closed enum. Do not infer accounting or
business meaning from layout alone. If a workbook exposes a source-backed facet
outside this list, record it in the `PurposeAdequacyFrame` with evidence and
promote it to this profile only after repeated real-source runs justify the
refinement.

## Scan Targets

- sheet list and used range per sheet
- named ranges
- table definitions
- formula cells and cross-sheet references
- merged ranges and distinct formatting regions
- hidden rows and columns
- data validation rules
- macro/VBA presence
- external data connections
