# Source Profile: Database

> Target material kind: `database`

## Registry Record

Current profile id, contract status, runtime implementation status, schema
version, profile version, migration status, and definition hash are owned by
`.onto/processes/reconstruct/reconstruct-contract-registry.yaml#source_profile_records`.
This file defines database observation semantics only.

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

## Purpose Evidence Cues

- schema names, table clusters, view names, migration labels, or comments
- primary keys, foreign keys, constraints, indexes, and uniqueness patterns
- reporting views, stored queries, materialized views, or downstream exports
- write paths, triggers, stored procedures, event tables, or audit/provenance
  tables
- ORM mappings, migration history, seed data, or service/database integration
  references

## Purpose Adequacy Facet Guidance

Common database facets include:

- central entity/table or record family
- relationship, cardinality, and constraint boundary
- read model, report, query, or analytical output
- write/update boundary, trigger, procedure, or lifecycle rule
- identity, uniqueness, validation, and integrity policy
- provenance, audit trail, migration history, or external integration boundary

These facets are guidance, not a closed enum. Do not assign business relation
meaning from schema shape alone. If a database target exposes a source-backed
facet outside this list, record it in the `PurposeAdequacyFrame` with evidence
and promote it to this profile only after repeated real-source runs justify the
refinement.

## Scan Targets

- schema list
- table and view count
- column and constraint summaries
- stored procedure/function list
- trigger list
- migration history table
