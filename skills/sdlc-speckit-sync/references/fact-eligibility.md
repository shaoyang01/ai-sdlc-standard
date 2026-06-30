# Fact Eligibility

## Eligible Facts

Sync facts that are:

- Stable beyond the current requirement.
- Verified by implementation, review, or testing.
- Traceable to spec, plan, tasks, implementation evidence, or review/test artifacts.
- Useful for future requirements, maintenance, or review.
- Consistent with existing domain language and knowledge structure.

Examples:

- Confirmed state transition rules.
- Domain terminology and definitions.
- Persistent data ownership and lifecycle rules.
- Cross-system integration responsibilities.
- Reusable compatibility, rollback, or idempotency expectations.
- Recurrent checklist or review rules discovered through implementation.

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
- Facts from superseded artifacts.
- Requirement-specific delivery notes that do not generalize.

## Evidence Requirement

Each synced fact must cite:

- Source artifact.
- Implementation evidence or verification result.
- Target document.
- Reason it is stable and reusable.

If evidence is missing, keep the item in a skipped list and recommend the needed verification.

## Partial Sync

Partial sync is allowed only when:

- Synced facts are independently verified.
- Skipped facts are recorded with reasons.
- Residual risks are recorded.
- Manifest recommendation clearly states partial sync.
