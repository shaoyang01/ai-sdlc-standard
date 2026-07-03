# Business-Domain Naming and Project Shape — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

### Naming Gate

- New-Rail create-if-missing in existing projects uses project canonical naming, not standard template naming.
- Naming pattern detected from sibling L4 documents, 01DomainCatalog.md, L2 index, governance profile, or user confirmation.
- Unknown naming → sync proposal only, must not write directly.
- Common patterns: `{L4_ID}{L4_NAME_EN}({L4_NAME_CN}).md`, `{L4_ID}EntryCoverage({CN}入口覆盖对账).md`.

### Project Shape Gate

- Standard templates (`templates/business-domain-l4/*.md`) are fallback only for new/no-shape projects and must not override existing project shape.
- Existing L4 update preserves shape (title format, section names, table styles, revision record).
- Target L4 missing → infer shape from sibling L4 under same L2.
- Shape confidence: high/medium → direct create-if-missing; low → user confirmation required; unknown → block/proposal.

### Create-If-Missing

- Requires separate authorization (not implied by generic write).
- Uses project canonical naming + project shape.
- Records: rail, source_artifacts, naming_pattern_source, shape_profile_source, shape_confidence.
- Updates L2 main document index + 01DomainCatalog.md + revision record.
- Must not create duplicate L4 candidate.

### Update Existing

- Compatible section update only, must not whole-document rewrite to New-Rail template.
- Preserves title format, section names, table styles, revision history.
- Must not add fixed English sections to Chinese-shape documents.
- Unknown insert point → update proposal only.

### Blocking Conditions

- canonical naming unknown
- shape confidence unknown
- duplicate L4 candidate exists
- standard template fallback attempted in existing project without explicit conditions
- whole-document rewrite attempted
- create-if-missing authorization missing
- L2 index or 01DomainCatalog.md update impossible

### Redlines

- New-Rail must not read or write `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**` as runtime input (New-Rail must not use these as runtime input — preserved_not_runtime_input).
- Standard templates must not default to standard L4 skeleton for existing projects (must not rewrite existing L4 to new template — forbidden).
- Must not create duplicate L4 (must not create duplicate L4 — forbidden).

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
