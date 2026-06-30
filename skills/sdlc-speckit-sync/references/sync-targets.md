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
- Explain source evidence.
- Explain update scope.
- Confirm the target is writable and in scope.
- Confirm user authorization for write.

Without authorization, output a sync proposal only.

## Target Conflict Rules

Stop when:

- The target already states a conflicting fact.
- Ownership is unclear.
- The update would delete or overwrite existing knowledge.
- The fact belongs to another bounded context or domain.

Recommend `sdlc-speckit-code-doc-reconcile` when code and knowledge appear to disagree.
