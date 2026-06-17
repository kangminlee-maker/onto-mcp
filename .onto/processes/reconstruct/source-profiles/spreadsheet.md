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
- protected ranges and sheet protection
- filters and auto-filter state
- charts, images, and object anchors
- external links and data connections to other workbooks or sources

## Correct Observation Examples

> Cells `A1:F1` are merged with background color `#4472C4`, bold font, and
> formatting different from the rows below.

> Cell `B2` contains `=VLOOKUP(A2, Sheet2!A:C, 3, FALSE)` and references columns
> `A:C` of `Sheet2`.

## Prohibited Interpretation Examples

> `A1:F1` is a table header.

> This sheet is a sales report.

> The formula is a cost-recognition policy.

> The `#REF!` in `B2` is a bug caused by a deleted column.

> The date in `C5` is stored as text, so it is wrong.

## Static Inspection Boundary

Static structural inspection reveals how formulas and structure were written, but
it cannot prove computed results. Record an observed formula or value as structure
inspected only; do not assert that a formula's output is correct unless an engine
recalculated it. Note unresolved external data, links, or connections as
unresolved rather than assuming their current values.

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

## Large Workbook Inspection Strategy

Inspect structure before converting the workbook to another format. Do not flatten
a workbook into a single table or dataframe before checking whether structure --
formulas, merged ranges, named ranges, and cross-sheet references -- carries
meaning.

For large workbooks, prefer narrow, targeted reads around the relevant ranges over
loading every sheet in full. Read the workbook's own structural index first -- the
sheet list, per-sheet dimensions, named ranges, and table definitions -- and use a
read-only or streaming inspection path so the used range and formula cells can be
observed without materializing the entire workbook.

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
- protected ranges and sheet protection
- filters and auto-filter state
- charts, images, and object anchors
- external links to other workbooks
- formula-error cells, recorded as literal tokens such as `#REF!`, `#N/A`, or `#VALUE!`
- structural-risk signals recorded literally and without diagnosis: cross-sheet references whose target sheet or range is absent, dates stored as text, empty cells inside a calculation chain, and lookup keys whose stored type differs from the target column
