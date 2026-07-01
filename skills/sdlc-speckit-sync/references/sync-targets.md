# Sync Targets

## Primary Targets

Common targets include:

- `.specify/business_domain/00BusinessLandscape.md`
- `.specify/business_domain/00UbiquitousLanguage.md`
- `.specify/business_domain/**` domain, workflow, capability, or integration documents
- Project checklist files
- ESS or review schema files
- Coding guides or workflow notes

Use only targets that exist or are explicitly approved for creation.

For `.specify/business_domain/**`, explicit approval for creation means create-if-missing authorization, not a generic write approval.

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

1. Resolve L1/L2/L4 target from `specs/{feature}/spec.md` `Business Domain Targets`, `Sync Targets`, the existing `01DomainCatalog.md`, and current business-domain documents.
2. Verify L1/L2 are confirmed long-term domain folders, not `99PendingConfirmation`.
3. Verify target ownership is explicit and the candidate fact belongs to that bounded context.
4. Verify create-if-missing authorization is recorded separately from ordinary write authorization.
5. Reserve L4 id using the L2 numbering convention; block when the id cannot be assigned without ambiguity.
6. Create an L4 skeleton with metadata, source traceability, entry coverage status, stable facts, skipped facts, and revision history.
7. Update the L2 main document index so the new L4 appears in the domain reading path.
8. Update `01DomainCatalog.md` so the new L4 is discoverable from the domain catalog.
9. Write only stable facts with source evidence; keep proposed or one-off facts in skipped items.
10. Run the standard entry coverage audit before reporting final `SYNCED`.

Required create-if-missing decision fields:

```text
Target L1:
Target L2:
Target L4 Id:
Target L4 Document:
Target Owner:
Create-If-Missing Authorization:
Source Evidence:
Entry Coverage Status:
L2 Main Document Index Update:
01DomainCatalog.md Update:
Revision History Update:
```

Block instead of creating when:

- L1/L2 are not confirmed.
- L4 id cannot be reserved.
- target owner is unclear.
- create-if-missing authorization is missing.
- the fact is proposed, unverified, one-off, or valid only for the current requirement.
- an existing business_domain fact conflicts with the proposed new document.
- entry coverage audit is `BLOCKED` or `PENDING`.

## Target Conflict Rules

Stop when:

- The target already states a conflicting fact.
- Ownership is unclear.
- The update would delete or overwrite existing knowledge.
- The fact belongs to another bounded context or domain.
- A missing L4 target would require writing to `99PendingConfirmation`.
- Create-if-missing would leave the L2 main document index or `01DomainCatalog.md` stale.

Recommend `sdlc-speckit-code-doc-reconcile` when code and knowledge appear to disagree.
