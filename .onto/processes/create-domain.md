# Domain Seed Generation Process

> Generates a seed domain document set from minimal input (name + description).
> Related: After seed creation, use `.onto/processes/feedback.md` to improve seeds, then `.onto/processes/learn/promote-domain.md` to promote to established.

Generates 8 domain document files in `~/.onto/drafts/{domain}/` with SEED markers on low-confidence content. The seed is a starting point — maturation happens through the feedback loop.

### 0. Input Validation

Parse and validate user input:

| Input | Required | Validation |
|---|---|---|
| domain name | Yes | Must be kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`) |
| description | Yes | Free text, 1-2 sentences describing the domain's subject |

**Collision check**: Verify that neither `~/.onto/drafts/{domain}/` nor `~/.onto/domains/{domain}/` already exists. If either exists, report the collision and halt.

### 1. Seed Generation

**Structural reference**: Read 1 established domain from `~/.onto/domains/` as a structural reference only — use its file format and section layout, not its content. If no established domain exists, use the agent's built-in knowledge of the 8-file structure.

**Generate 8 files** per the strategy table in design document Section 2:

| File | Strategy | SEED Markers |
|---|---|---|
| `domain_scope.md` | LLM infers key sub-areas from description | On low-confidence sub-areas |
| `concepts.md` | LLM infers core terminology | On all items |
| `competency_qs.md` | Empty skeleton (section headings only) | Entire file is seed state |
| `logic_rules.md` | LLM infers expected logic rules | On all items |
| `structure_spec.md` | LLM infers structural rules | On all items |
| `dependency_rules.md` | LLM infers dependency rules | On all items |
| `extension_cases.md` | Empty skeleton (section headings only) | Entire file is seed state |
| `conciseness_rules.md` | LLM infers conciseness rules | On all items |

**Experience gates**: `competency_qs.md` and `extension_cases.md` are intentionally generated as empty skeletons. These files require real review experience to populate — LLM inference cannot produce valid content for them. This structurally prevents premature domain promotion.

**SEED marker format**: Per design document Section 2 specification.

```markdown
<!-- SEED: low-confidence, needs evidence -->
## Some Section Title
- Some LLM-inferred content
<!-- /SEED -->
```

### 2. Reference Graph Validation

After generation, validate the reference graph:

1. **File completeness**: All 8 files exist in `~/.onto/drafts/{domain}/`.
2. **Cross-references**: Each file's `Related Documents` section must reference exactly the other 7 files. Verify all references resolve to existing files.

If validation fails, fix the issues before proceeding.

### 3. Output and Guidance

**Save** all 8 files to `~/.onto/drafts/{domain}/`.

**Show completion report**:

```markdown
## Seed Generation Complete

| Item | Value |
|---|---|
| Domain | {domain} |
| Location | ~/.onto/drafts/{domain}/ |
| Files generated | 8 |
| SEED markers | {count} |
| Experience-gated files | competency_qs.md, extension_cases.md |

### Next Steps
- Review the seed through MCP review (recommended: no-domain mode)
- Run the feedback loop after learnings accumulate
- Promote to established after all SEED markers are removed
```
