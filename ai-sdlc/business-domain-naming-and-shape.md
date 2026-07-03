# Business-Domain Naming and Project Shape

> **Reference**: `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`

## Purpose

`.specify/business_domain/**` is a shared long-term knowledge base governed by both `legacy_speckit` and `new_rail_sdlc` rails. Document naming and document shape are **project-level invariants** — they must be preserved across rails to maintain consistency. New-Rail create-if-missing must use the project's current naming convention and preserve existing shape. Create-if-missing authorization is required separately from generic write authorization.

This file supplements `${AI_SDLC_STANDARD_HOME}/ai-sdlc/shared-business-domain-governance.md` with detailed rules for:

- Detecting and applying project canonical naming conventions.
- Detecting and preserving project document shape.
- Safe create-if-missing and update-existing operations.
- Shape confidence grading and blocking rules.

## Canonical Naming Rules

### Rule

L1/L2/L4 document naming must follow the project's current business_domain naming convention. New-Rail must never invent a new naming pattern for an existing project.

### Common Patterns

| Pattern | Example |
| --- | --- |
| `{L4_ID}{L4_NAME_EN}({L4_NAME_CN}).md` | `010104StraightOrderOutboundReceipt(直送出库回执).md` |
| `{L4_ID}{L4_NAME_EN} ({L4_NAME_CN}).md` | `010104StraightOrderOutboundReceipt (直送出库回执).md` |
| `{L2_ID}{L2_NAME_EN}({L2_NAME_CN}).md` | `01ReceiveAndFulfillment(销单接单与履约).md` |
| `{L4_ID}EntryCoverage({L4_NAME_CN}入口覆盖对账).md` | `010199EntryCoverage(销单入口覆盖对账).md` |
| `{L1_ID}{L2_ID}{L4_ID}{L4_NAME_EN}({L4_NAME_CN}).md` | `010101ReceiveOrderMainChain(销单接单主链).md` |

### Naming Resolution

Before creating or updating any business_domain document, resolve:

| Field | Description | Source |
| --- | --- | --- |
| Target L1 | L1 domain identifier and path | Route artifact, spec, catalog, or user confirmation |
| Target L2 | L2 domain identifier and path | Same as above |
| Target L4 id | Reserved L4 numeric identifier | L2 numbering convention, sibling L4 docs, catalog |
| Target L4 English name | Stable English name for the L4 | Route artifact, spec, or user confirmation |
| Target L4 Chinese name | Stable Chinese name for the L4 | Same as above |
| Target document path | Full relative path under `.specify/business_domain/` | Derived from naming pattern + resolved fields |
| naming pattern source | Where the naming pattern was determined from | See below |

### Naming Pattern Source

The naming pattern can be determined from (in priority order):

1. Sibling L4 documents under the same L2 directory.
2. `01DomainCatalog.md` entries for the same L2.
3. L2 main document index.
4. `.specify/project-governance-profile.yaml` or business-domain governance profile.
5. Explicit user confirmation.

If the naming pattern cannot be reliably determined from any source, generate a sync proposal only. Do not write directly to business_domain.

## Project Shape Rules

### Rule

Document shape — title format, metadata fields, section language, section order, table structure, and revision record format — is a project-level invariant. New-Rail must not impose its own template shape on existing projects.

### Shape Elements

| Element | Description |
| --- | --- |
| Title format | `# L4_ID+L4_NAME_EN (L4_NAME_CN)` vs `# L4_NAME_EN(L4_NAME_CN)` vs other |
| Metadata fields | Which metadata fields are present and in what order |
| Section language | Chinese section names vs English section names |
| Section order | Typical section sequence in sibling documents |
| Table structure | Column count, alignment style (`:---` vs `---`), header style |
| Revision record | Format and location of the revision history section |

### Shape Detection

- **Target L4 exists**: Preserve existing shape. Do not rewrite to New-Rail template.
- **Target L4 missing, sibling L4 exists under same L2**: Infer project shape from sibling L4 documents.
- **Target L4 missing, no sibling under same L2**: Infer from other L2 directories in the same project, but reduce shape confidence to `medium`.
- **No project shape detectable**: Mark shape confidence as `unknown`. Generate proposal only.

### Standard Template Fallback

`${AI_SDLC_STANDARD_HOME}/templates/business-domain-l4/*.md` may only be used when:

- No existing project shape exists (new project or first business_domain document).
- User explicitly confirms standard template fallback.
- `standard_template_fallback_allowed` is `true` in the governance profile.
- Using the standard template will not conflict with existing legacy or project shape.

Standard templates must **never** be used as the default for existing projects. Using a standard template to overwrite or replace existing project shape is prohibited.

## Create-If-Missing Rules

### Preconditions

Create-if-missing requires:

- Separate authorization from generic write authorization.
- Confirmed L1/L2 target.
- Reserved L4 id using project numbering convention.
- Resolved canonical naming pattern.
- Resolved project shape profile.
- Shape confidence `high` or `medium` (or `low` with user confirmation).

### Creation Requirements

When creating a new L4 document:

1. Use project canonical naming (not standard template naming).
2. Use project shape (not standard template shape).
3. Update L2 main document index to include the new L4.
4. Update `01DomainCatalog.md` to include the new L4.
5. Record revision record with source traceability.

### Metadata to Record

Every create-if-missing must record in the document or associated manifest:

| Field | Value |
| --- | --- |
| rail | `new_rail_sdlc` |
| source_artifacts | Paths to source artifacts |
| naming_pattern_source | Where the naming pattern was resolved from |
| shape_profile_source | Where the shape profile was resolved from |
| shape_confidence | `high` / `medium` / `low` / `unknown` |
| create_if_missing_authorization | Authorization record |

### Prohibited

- Do not create a duplicate L4 candidate (same domain concept, different L4 id or path).
- Do not create under `99PendingConfirmation` or similar unconfirmed paths.
- Do not create using standard template naming or shape in existing projects.
- Do not skip L2 index or `01DomainCatalog.md` update.

## Update Existing Rules

Compatible update, proposal, conflict handling, and revision traceability rules are defined in `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-compatible-update.md`. Shape preservation is mandatory before applying any compatible update. Existing shape detection does not imply permission to rewrite. Safe insertion point must be resolved before direct write.

### Compatible Update Only

When the target L4 already exists:

- **Preserve existing shape**: title format, section names, table styles, revision record format.
- **Compatible section update**: Insert or append new stable facts into the closest matching existing section.
- **Do not whole-document rewrite**: Never replace an entire existing L4 with a new template.
- **Preserve existing facts**: Unless explicitly superseded by new evidence with source traceability.
- **Section language**: New sections must match the existing document's language convention (Chinese if existing sections are Chinese, English if English).
- **No New-Rail template sections**: Do not add fixed English sections (e.g., "Entry Chain", "Transaction Boundary") to a document that uses Chinese section names.

If a safe insertion point cannot be found, generate an update proposal. Do not guess.

## Shape Confidence

| Level | Condition | Action |
| --- | --- | --- |
| `high` | Multiple sibling L4 documents under the same L2 have consistent shape | Direct create-if-missing allowed with authorization |
| `medium` | Other L2 directories in the same project have consistent shape, but current L2 has no siblings | Direct create-if-missing allowed with authorization |
| `low` | Only catalog/index or single sample available as reference | Proposal only, unless user explicitly confirms |
| `unknown` | No reliable shape sample exists | Block / proposal only |

## Blocking Rules

Block or generate proposal (do not write directly) when:

- Unknown naming pattern.
- Unknown L4 id.
- Unknown L2 owner.
- Duplicate L4 candidate exists (same domain concept already covered).
- Shape confidence `low` without user confirmation.
- Shape confidence `unknown`.
- Target document would be created under `99PendingConfirmation`.
- Create-if-missing authorization missing.
- L2 main document index update impossible.
- `01DomainCatalog.md` update impossible.
- Existing document shape cannot be safely updated.
- Proposed update would rewrite whole document.
- Proposed update would delete existing facts.
- Standard template fallback attempted in existing project without explicit conditions.
- Entry coverage audit is `BLOCKED` or `PENDING` for the target domain.
