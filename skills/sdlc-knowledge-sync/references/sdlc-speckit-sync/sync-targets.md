# Sync Targets

## Primary Targets

`.specify/business_domain/**` is the single-rail long-term knowledge base of `sdlc-knowledge-sync` (Decision-044/088; there are no competing rails or source modes). Resolve it deterministically before any sync: read `.specify/business_domain/knowledge-target.yaml` (created by `scripts/bootstrap-knowledge-target.sh`). Missing declaration → BLOCKED with initialization guidance; `routable: false` → proposals only. See `${AI_SDLC_STANDARD_HOME}/ai-sdlc/shared-business-domain-governance.md` for the full governance protocol.

Common targets include:

- `.specify/business_domain/00BusinessLandscape.md`
- `.specify/business_domain/00UbiquitousLanguage.md`
- `.specify/business_domain/**` domain, workflow, capability, or integration documents
- Project checklist files
- Standard package checklist/schema/process-guide proposals (never target project `.specify/workflow/**` or `.specify/coding_guide/**`)

Use only targets that exist or are explicitly approved for creation.

For `.specify/business_domain/**`, explicit approval for creation means create-if-missing authorization, not a generic write approval.

## Library-Driven Target Resolution

Library-driven resolution is the only resolution path (single rail); it never depends on run-level working materials:

- Resolve Business Domain Targets from `library/{requirement_id}/01-技术方案/*` or manifest.
- Resolve Sync Targets from `library/{requirement_id}/00-需求资料/*` or explicit user confirmation.
- If targets cannot be resolved from library artifacts, generate a sync proposal or ask the user.
- If target L1/L2/L4 is ambiguous, generate a proposal only; do not guess.

## Shared Governance Rules

When writing to `.specify/business_domain/**`:

- Target L4 exists → update existing document; do not create parallel L4.
- Target L4 does not exist → create-if-missing with authorization.
- Document naming must follow project current naming convention.
- Do not create duplicate L4 for the same domain concept.
- Record rail/source in revision record.
- When naming convention is unclear → sync proposal only.
- New-Rail must not read or write `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**`.

## Target Selection Rules

Select `.specify/business_domain/**` when the fact is:

- Stable business domain knowledge.
- Reusable across future requirements.
- Verified by implementation, review, or tests.
- Expressed in domain language or system behavior that belongs in business knowledge.

Select checklist or schema targets when the fact is:

- A reusable review or testing rule.
- A recurring specification gap.
- A process guardrail rather than domain behavior.

Select no target when the fact is:

- Temporary implementation detail.
- One-off task note.
- Debugging trace.
- Local environment behavior.
- Unverified assumption.

## Authorization Rules

Before applying updates:

- Identify exact target path.
- Identify L1 path, L2 path, L4 id, L4 document name, and owner for every `.specify/business_domain/**` target.
- Explain source evidence.
- Explain update scope.
- Confirm the target is writable and in scope.
- Confirm user authorization for write.
- Confirm create-if-missing authorization when the L4 document does not exist.
- Confirm whether the final change must update the L2 main document index and `.specify/business_domain/01DomainCatalog.md`.

Without authorization, output a sync proposal only.

## Business-Domain Create-If-Missing Flow

Use this flow when a stable fact belongs in `.specify/business_domain/**` but the L4 document is missing:

1. Resolve L1/L2/L4 target from `.specify/business_domain/knowledge-target.yaml` (routable check), the existing `01DomainCatalog.md`, `library/{requirement_id}/01-技术方案/*`, and current business-domain documents.
2. Verify L1/L2 are confirmed long-term domain folders; unconfirmed pending buckets are never sync targets.
3. Detect project canonical naming pattern from sibling L4 documents, `01DomainCatalog.md`, L2 main document index, governance profile, or user confirmation. See `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`.
4. Detect project shape profile from sibling L4 documents under the same L2, or other L2 directories in the same project. See the same reference.
5. Determine shape confidence (`high`, `medium`, `low`, `unknown`).
6. Verify target ownership is explicit and the candidate fact belongs to that bounded context.
7. Verify create-if-missing authorization is recorded separately from ordinary write authorization.
8. Reserve L4 id using the project numbering convention; block when the id cannot be assigned without ambiguity.
9. If target L4 already exists, update existing document and preserve existing shape. See `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md` Update Existing Rules.
10. If target L4 is missing:
    - Require create-if-missing authorization.
    - Create target document using project canonical naming.
    - Create target document using project shape.
    - Use `${AI_SDLC_STANDARD_HOME}/templates/business-domain-l4/*.md` only when: no existing project shape exists, user confirms standard template fallback, `standard_template_fallback_allowed=true`, and this will not conflict with existing legacy/project shape.
    - Update L2 main document index so the new L4 appears in the domain reading path.
    - Update `01DomainCatalog.md` so the new L4 is discoverable from the domain catalog.
11. Write only stable facts with source evidence; keep proposed or one-off facts in skipped items.
12. Record rail, source_artifacts, naming_pattern_source, shape_profile_source, and shape_confidence in the revision record.
13. Run the standard entry coverage audit before reporting final `SYNCED`.

Use the enhanced entry coverage audit result, not raw path presence alone:

- `entry_inventory.tsv` business_entry rows identify business entries that need
  durable L4 coverage.
- `service_inventory.tsv` reverse_coverage_status identifies Service / Manager /
  Mapper / Repository / Client core units that still need business-domain
  evidence.
- technical_bridge, framework_bridge, generated_or_vendor, native_shell,
  abstract_or_base, annotation_or_marker, and not_applicable rows are visible
  evidence but must not drive create-if-missing by themselves.
- table/code anchor/path/method/route/topic/job/function/SQL/connector/sink
  match reason is stronger evidence than plain text contains.
- frontend native shell and generated/vendor noise must be excluded from
  business create-if-missing unless profile evidence explicitly marks it as
  business behavior.
- ETL job/function/connector/sink and SQL lineage evidence may justify
  create-if-missing only when the route artifact confirms the L1/L2/L4 owner and
  the fact is stable reusable knowledge.

Standard Template Fallback Selection

This section applies only when standard template fallback is explicitly active:
- no existing project shape exists;
- user confirms standard template fallback;
- `standard_template_fallback_allowed=true`;
- fallback does not conflict with existing legacy/project shape.

When fallback is active, template selection precedence:

```text
admin-mixed-workflow
data-pipeline-etl
frontend-application
library-shared-component
backend-business-service
```

Use `backend-business-service` only as a conservative fallback when no project
type profile is available. Do not use one generic L4 skeleton as the only
default for all project types.

Required create-if-missing decision fields:

```text
Target L1:
Target L2:
Target L4 Id:
Target L4 Document:
Target Owner:
Naming Pattern Source:
Shape Profile Source:
Shape Confidence:
Create-If-Missing Authorization:
Standard Template Fallback Allowed:
Selected L4 Template: (only when standard template fallback is active)
Source Evidence:
Entry Coverage Status:
L2 Main Document Index Update:
01DomainCatalog.md Update:
Revision History Update:
```

For existing L4 documents, use compatible update protocol per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-compatible-update.md`. Required update decision fields: Existing Shape Summary, Safe Insertion Point, Section Mapping Rationale, Update Mode (DIRECT_UPDATE | UPDATE_PROPOSAL | RECONCILE_PROPOSAL | BLOCKED), Existing Facts Preserved, Conflict Type (when applicable), Implementation Evidence, Verification Evidence.

Block instead of creating when:

- L1/L2 are not confirmed.
- L4 id cannot be reserved.
- Naming pattern unknown.
- Shape profile unknown.
- Shape confidence `low` without user confirmation.
- Shape confidence `unknown`.
- Duplicate L4 candidate exists.
- Standard template fallback not allowed.
- Using standard skeleton would conflict with existing project shape.
- Standard template fallback is explicitly active, but Project Type Profiles or selected fallback template cannot be resolved.
- Target owner is unclear.
- Create-if-missing authorization is missing.
- The fact is proposed, unverified, one-off, or valid only for the current requirement.
- An existing business_domain fact conflicts with the proposed new document.
- Entry coverage audit is `BLOCKED` or `PENDING`.

## Target Conflict Rules

Stop when:

- The target already states a conflicting fact.
- Ownership is unclear.
- The update would delete or overwrite existing knowledge.
- The fact belongs to another bounded context or domain.
- A missing L4 target would require writing to `99PendingConfirmation`.
- Create-if-missing would leave the L2 main document index or `01DomainCatalog.md` stale.

Recommend `sdlc-speckit-code-doc-reconcile` when code and knowledge appear to disagree.
