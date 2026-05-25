# Explorer Profile: Database

## Exploration Tools
SQL query tools (MCP server, CLI, etc.)

## module_inventory Unit
Table / Schema

## Structural Recognition Scope
- Tables, columns, data types
- FK (Foreign Key) constraints
- Indexes
- Stored procedures, functions
- Views
- Triggers
- Constraints (UNIQUE, CHECK, NOT NULL)

## Source Type Identification Criteria
- $ARGUMENTS is a DB connection string or SQL file
- .sql file extension
- User explicitly specifies "database" or "DB"

## Structural Recognition Examples

Correct reporting:
> "The orders table has a user_id column, but there is no FK constraint referencing the users table."

> "The payment_status column is VARCHAR(20) with a CHECK constraint allowing only 3 values: 'PENDING', 'COMPLETED', 'REFUNDED'."

Incorrect reporting:
> "orders is a sub-entity of users."

> "This table is a Lookup table."

## detail Location Format
`"{description} — {schema}.{table}.{column}"`

Example: `"FK constraint — public.orders.user_id -> public.users.id"`

## Phase 0.5 Context Questions
- "Who is the primary consumer of this DB? (service, reports, analytics tools)"
- "Do you use an ORM? Which one?"
- "Do you use a migration tool? (Flyway, Liquibase, etc.)"
- "Is there an existing domain glossary?"

## Phase 0.5 Scan Targets
- Schema list
- Table/view count
- Stored procedure/function list
- Presence of triggers
- Presence of migration history table
