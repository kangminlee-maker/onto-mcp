# Ontology Transform Process

> Converts the Raw Ontology into the user's desired format.
> Related: Input is the Raw Ontology built by reconstruct. After transform, verification is possible through MCP review.

Converts the Raw Ontology (`.onto/builds/{session ID}/raw.yml`) into the user's desired format.

### 1. Source Verification

- Reads the file specified by $ARGUMENTS, or `{project}/.onto/builds/{session ID}/raw.yml`.
- If the file does not exist, inform the user and halt: "Build the Raw Ontology with reconstruct first."
- Also reads schema.yml to understand the ontology structure.

### 2. Output Format Negotiation

Ask the user for the desired output format:

```markdown
## Please specify the transform format

What format should the Raw Ontology be transformed into?

**Examples**:
- Markdown (human-readable document)
- Mermaid (visual diagram)
- YAML (structured data)
- JSON-LD (Linked Data)
- OWL/RDF (standard ontology)
- Markdown with inline YAML (hybrid)
- Other — please describe the desired format

**Additional options**:
- Inclusion scope: all / confirmed items only / convergence N or above
- Detail level: include rationale / exclude rationale
```

### 3. Transform Execution

Transforms the contents of raw.yml according to the user-specified format.

**Transform principles**:
- Preserves the Raw Ontology's information to the maximum extent allowed by the target format.
- If information is lost because the format does not support it, inform the user.
- Metadata such as convergence/rationale is included if the format supports it; otherwise, separated into comments/separate files.

### 4. Save

- Saves the transform result to `{project}/.onto/builds/{session ID}/{format-specific filename}`.
  - Examples: `ontology.md`, `ontology.mermaid`, `ontology.jsonld`, `ontology.owl`
- If the filename conflicts, confirm with the user.

Completion report:

```markdown
## Transform Complete

| Item | Value |
|---|---|
| Source | {raw.yml path} |
| Output format | {format} |
| Inclusion scope | {all / confirmed only / ...} |
| Dropped information | {specify if any / none} |

Save path: `.onto/builds/{session ID}/{filename}`
```
