# Source Profile: Database

> Target material kind: `database`

## Support Status

Design profile only. Runtime adapter support is not wired in the current repo.

## Target Material Identification Hints

- Target is a database connection string supplied through an explicit runtime
  boundary.
- Target is a `.sql` schema or migration file.
- User explicitly identifies the target as a database, DB, schema, migration, or
  warehouse model.

## Module Inventory Unit

Schema, table, view, migration file, stored procedure, or function.

## Structural Recognition Scope

- schemas, tables, columns, and data types
- primary keys and foreign keys
- indexes
- unique, check, not-null, and default constraints
- views
- stored procedures and functions
- triggers
- migration history

## Correct Observation Examples

> The `orders.user_id` column exists, but no foreign key constraint references
> `users.id`.

> `payment_status` is `varchar(20)` with a check constraint allowing `PENDING`,
> `COMPLETED`, and `REFUNDED`.

## Prohibited Interpretation Examples

> `orders` is a child entity of `users`.

> This table is a lookup table.

## Detail Location Format

```text
{description} -- {schema}.{table}.{column}
```

Example:

```text
FK absence -- public.orders.user_id
```

## Context Questions

- Who primarily consumes this database: service, reporting, analytics, or manual
  operation?
- Is there an ORM or migration tool?
- Is there an existing domain glossary?
- Are there read models, reporting tables, or compatibility tables mixed with
  transactional schema?

## Scan Targets

- schema list
- table and view count
- column and constraint summaries
- stored procedure/function list
- trigger list
- migration history table
