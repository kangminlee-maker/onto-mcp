# Explorer Profile: Spreadsheet

## Exploration Tools
Spreadsheet parsing tools (MCP server, etc.)

## module_inventory Unit
Sheet / Named Range / Table

## Structural Recognition Scope
- Cell values (string, number, date)
- Formulas and inter-formula reference relationships
- Formatting (background color, font, borders, merged cells)
- Cross-sheet references
- Data validation rules
- Named Ranges
- Presence of macros/VBA

## Source Type Identification Criteria
- File extension: .xlsx, .xls, .csv, .ods
- MIME type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

## Structural Recognition Examples

Correct reporting:
> "Cells A1:F1 are merged with background color #4472C4, Bold font, and different formatting from the rows below."

> "Cell B2 contains the formula =VLOOKUP(A2, Sheet2!A:C, 3, FALSE), referencing columns A-C of Sheet2."

Incorrect reporting:
> "A1:F1 is a table header."

> "This sheet is a sales report."

## detail Location Format
`"{description} — {sheet}:{cell range}"`

Example: `"Formula =SUM(B2:B10) — Sheet1:B11"`

## Phase 0.5 Context Questions
- "What is the primary purpose of this file? (report, data collection, calculation model, dashboard, ...)"
- "Do colors or formatting have special meaning? (e.g., red cell = unresolved, gray row = inactive)"
- "Who primarily uses this file?"
- "Is there an existing domain glossary?"

## Phase 0.5 Scan Targets
- Sheet list and used range per sheet
- Named range list
- Table definitions (ListObject)
- Presence of macros/VBA modules
- External data connections (ODBC, external file references)
