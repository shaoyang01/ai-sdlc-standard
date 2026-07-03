# Shared Business-Domain Governance

> **Reference**: `${AI_SDLC_STANDARD_HOME}/ai-sdlc/shared-business-domain-governance.md`

## Purpose

Define `.specify/business_domain/**` as a **shared long-term knowledge base** governed by both `legacy_speckit` and `new_rail_sdlc` rails. Unlike `specs/` (run-level) and `library/` (requirement-level), business_domain is a persistent cross-requirement knowledge store.

## Shared Knowledge Base

`.specify/business_domain/**` is the single source of truth for stable business domain knowledge. It is:

- **Long-term**: Not tied to any single requirement or pipeline run.
- **Shared**: Both `legacy_speckit` and `new_rail_sdlc` may read and write it.
- **Governed**: Writes must follow this governance protocol regardless of rail.

## Writing Rules

### Before Writing

1. Resolve target L1/L2/L4 from route artifact, spec, or explicit user confirmation.
2. Verify L1/L2 are confirmed long-term domains, not temporary or pending.
3. Verify L4 id can be assigned without ambiguity.
4. Identify naming pattern source and determine the project's canonical naming convention per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`.
5. Identify shape profile source and determine shape confidence per the same reference.
6. Verify the target document naming follows the project's current business_domain naming convention.
7. Verify the fact is stable, reusable, and verified by implementation evidence.

### When Target L4 Exists

- **Update the existing document.** Do not create a parallel L4 document for the same domain concept.
- Preserve the existing document structure and naming pattern.
- Add new stable facts to the appropriate section.
- Update the revision record with source artifacts and rail identifier.

### When Target L4 Does Not Exist

- **Create-if-missing** with authorization. See `sync-targets.md` for the full create-if-missing flow and `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md` for naming and shape rules.
- Use the project's current naming convention for the new L4 document.
- Use the project's current shape for the new L4 document.
- Standard templates (`templates/business-domain-l4/*.md`) are fallback only when no project shape exists and user confirms.
- Do not create a second L4 document that covers the same domain concept as an existing document (even if from a different rail).

### Prohibited

- Do not create a parallel L4 document that duplicates the semantics of an existing L4.
- Do not rename or restructure existing L4 documents without explicit owner authorization.
- Do not overwrite existing facts without source evidence and revision record.
- Do not create documents under `99PendingConfirmation` or similar unconfirmed paths.
- New-Rail must not read or write `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**`.
- Do not default to standard L4 skeleton (`templates/business-domain-l4/*.md`) in existing projects.
- Do not rewrite existing L4 documents to New-Rail template shape.
- Do not create duplicate L4 candidate for the same domain concept.

## Naming Convention

Document naming must follow the project's current convention. Common patterns:

- `{L4_ID}{L4_Name_EN}({L4_Name_CN}).md`
- `{L2_ID}{L2_Name_EN}({L2_Name_CN}).md`
- `{L4_ID}EntryCoverage({Domain_Name_CN}入口覆盖对账).md`

When the naming convention is unclear, ambiguous, or unavailable:

- Generate a sync proposal only, not a direct write.
- Ask the user or domain owner to confirm the naming convention.

## Rail/Source Recording

Every write to `.specify/business_domain/**` must record:

| Field | Description |
| --- | --- |
| `rail` | `legacy_speckit` or `new_rail_sdlc` |
| `source_artifacts` | Paths to source artifacts that support the fact |
| `naming_pattern_source` | Where the naming pattern was resolved from |
| `shape_profile_source` | Where the shape profile was resolved from |
| `shape_confidence` | `high` / `medium` / `low` / `unknown` |
| `revision_record` | Standard revision record entry (date, author/skill, change type, summary) |

## Conflict Handling

When a proposed fact conflicts with an existing business_domain fact:

1. Do not overwrite silently.
2. Identify both statements and their source evidence.
3. Determine whether the conflict is code drift, document drift, or new behavior.
4. Generate a reconcile proposal with recommended Re-Gate node.
5. Route to `sdlc-speckit-code-doc-reconcile` when a code/document consistency audit is needed.

When shape, naming, L4 id, or semantics are unclear:

- Generate sync proposal only.
- Do not write directly to business_domain.
- Require user or domain owner confirmation.

## Relationship to Specs and Library

- `specs/` is run-level. It may be archived after business_domain sync.
- `library/` is requirement-level. It persists independently of specs.
- `business_domain/` is long-term. It accumulates stable facts across requirements and rails.
