# Productization Charter Reshuffle History

> Status: archived development record.
> Runtime authority: none.

This record preserves the historical reshuffle crosswalk removed from the active
productization charter on 2026-06-05. Active runtime and process documents must
not load this record as current authority.

## Migration Crosswalk (2026-04-06 reshuffle)

This table tracked where files and sections moved during the 2026-04-06
authority reshuffle.

### Deleted Authority Files

| Deleted file | Handling | Successor seat |
|---|---|---|
| `.onto/authority/development-methodology.md` | Absorbed | §4.2 (Interface Design Priority) -> `llm-runtime-interface-principles.md` §6; §5 (First Migration Priority) -> `productization-charter.md` §13 Bootstrap Sequence; §4.1 (CIRU preservation) -> `llm-native-development-guideline.md` context-isolated reasoning unit section; remaining principles overlapped existing `llm-native-development-guideline.md` and `productization-charter.md` sections |
| `.onto/authority/ontology-as-code-korean-terminology-guide.md` | Absorbed | 21 Korean labels existed in `core-lexicon.yaml`; naming rules are owned by `ontology-as-code-naming-charter.md` |
| `.onto/authority/principles-criteria-decisions-inventory.md` | Deleted | Audit index; content existed in `productization-charter.md` §5 Decision Criteria and §6 Current Decisions |

### Moved Files

| Previous location | Archived handling | Reason |
|---|---|---|
| `.onto/authority/philosophical-foundations-of-ontology.md` | isolated historical reference | Background ontology evaluation theory; no active authority seat |
| `.onto/authority/discovered-enhancements.md` | isolated historical tracking | Backlog/tracking document, not authority |

### Intentional De-Scope

| Area | Decision | Reason |
|---|---|---|
| Lens semantic grounding (Obrst L1, OntoClean Rigidity/Identity, Gomez-Perez) | historical reference outside authority | Review-first productization grounded lens meaning in `core-lens-registry.yaml` and `core-lexicon.yaml` |
| Non-review process and system authority surface | de-scoped during review-first productization | Deep authority for reconstruct/learn/govern was deferred until review stabilized |
| Prototype coordinator model | de-canonicalized | Historical reference only |

## Reshuffle 2026-04-07

Deployment security and ontology-as-code folder separation.

### Files Moved From `.onto/authority/` To `.onto/principles/`

| Previous location | New location | Reason |
|---|---|---|
| `.onto/authority/ontology-as-code-guideline.md` | `.onto/principles/ontology-as-code-guideline.md` | Development guideline, not runtime-consumed authority |
| `.onto/authority/llm-native-development-guideline.md` | `.onto/principles/llm-native-development-guideline.md` | Same |
| `.onto/authority/productization-charter.md` | `.onto/principles/productization-charter.md` | Same |
| `.onto/authority/llm-runtime-interface-principles.md` | `.onto/principles/llm-runtime-interface-principles.md` | Same |
| `.onto/authority/ontology-as-code-naming-charter.md` | `.onto/principles/ontology-as-code-naming-charter.md` | Same |

### Directory Rename

| Previous name | New role | Reason |
|---|---|---|
| `dev-docs/` | isolated development-history path | Name reflects development-history recording; excluded from distribution |

### Folder Classification

| Folder | Conceptual axis | Role | Distribution |
|---|---|---|---|
| `.onto/authority/` | canonical data | define | included |
| `.onto/principles/` | development governance | prescribe | excluded |
| isolated development-history path | development history | record | excluded |

## Reshuffle 2026-04-08

Removed the `onto_` prefix from agent IDs. Canonical lens and role IDs changed
to bare-form IDs.

| Previous ID | New ID |
|---|---|
| `onto_logic` | `logic` |
| `onto_structure` | `structure` |
| `onto_dependency` | `dependency` |
| `onto_semantics` | `semantics` |
| `onto_pragmatics` | `pragmatics` |
| `onto_evolution` | `evolution` |
| `onto_coverage` | `coverage` |
| `onto_conciseness` | `conciseness` |
| `onto_axiology` | `axiology` |
| `onto_synthesize` | `synthesize` |

Role files moved from `roles/onto_{id}.md` to `roles/{id}.md`.

Current runtime accepts canonical lens IDs only.
