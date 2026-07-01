# Fact Eligibility

## Eligible Facts

Sync facts that are:

- Stable beyond the current requirement.
- Verified by implementation, review, or testing.
- Traceable to spec, plan, tasks, implementation evidence, or review/test artifacts.
- Useful for future requirements, maintenance, or review.
- Consistent with existing domain language and knowledge structure.
- Routed to a confirmed L1/L2/L4 target, or to an authorized create-if-missing L4 target with explicit owner and reserved id.

Examples:

- Confirmed state transition rules.
- Domain terminology and definitions.
- Persistent data ownership and lifecycle rules.
- Cross-system integration responsibilities.
- Reusable compatibility, rollback, or idempotency expectations.
- Recurrent checklist or review rules discovered through implementation.
- Stable entry coverage responsibilities for backend, frontend, ETL, integration, or scheduled-job entry types when source evidence proves the ownership.

## Ineligible Facts

Do not sync:

- Chat fragments.
- Temporary debugging notes.
- One-off implementation tactics.
- Local machine paths, credentials, tokens, or environment details.
- Unverified assumptions.
- Failed experiments.
- Open questions.
- Risks that are not accepted or resolved.
- Facts from stale or replaced artifacts.
- Requirement-specific delivery notes that do not generalize.
- Facts that only justify a create-if-missing document for the current one-off requirement.
- Facts routed to unconfirmed L1/L2 or `99PendingConfirmation`.
- Facts whose business-domain owner, entry coverage status, or long-term stability cannot be explained.

## Evidence Requirement

Each synced fact must cite:

- Source artifact.
- Implementation evidence or verification result.
- Target document.
- Reason it is stable and reusable.
- For create-if-missing, the confirmed L1/L2 route, reserved L4 id, target owner, create authorization, and entry coverage status.

If evidence is missing, keep the item in a skipped list and recommend the needed verification.

## Create-If-Missing Eligibility

A fact may create a missing L4 only when all conditions are true:

- The fact is verified by implementation, review, or tests.
- The fact is stable beyond the current requirement and useful for future requirements.
- `spec.md` or existing domain catalog evidence identifies the intended business-domain target.
- L1/L2 are confirmed and not pending placeholders.
- The target owner is explicit.
- The L4 id can be reserved without colliding with existing documents.
- The Sync output can update the L2 main document index and `01DomainCatalog.md`.
- The standard entry coverage audit can run after the write.

Block create-if-missing when the fact is proposed, speculative, temporary, one-off, ownerless, or conflicts with existing business_domain knowledge.

## Entry Coverage Fact Shape

When syncing facts for a frontend, backend, ETL, integration, or scheduler entry, record:

```text
Entry Type:
Entry Identifier:
Stable Responsibility:
Owning L4:
Source Evidence:
Verification Evidence:
Coverage Status:
```

Do not sync entry coverage facts when only the current requirement used the entry and no stable ownership rule was proven.

## Partial Sync

Partial sync is allowed only when:

- Synced facts are independently verified.
- Skipped facts are recorded with reasons.
- Residual risks are recorded.
- Manifest recommendation clearly states partial sync.
