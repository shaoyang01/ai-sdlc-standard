# Conflict And Blocking

## Blocking Conditions

Stop when:

- Implementation is not verified.
- Source artifacts are missing or stale.
- Target path is unclear.
- L1/L2 are unconfirmed for a missing `.specify/business_domain/**` L4 target.
- L4 id cannot be reserved for create-if-missing.
- Project Type Profiles are missing or cannot select an L4 skeleton for create-if-missing.
- Target owner is unclear for an existing or new business-domain document.
- User did not authorize writing to the target.
- User did not explicitly authorize create-if-missing when the business-domain L4 target is missing.
- Proposed fact conflicts with existing knowledge.
- Proposed fact is not stable or reusable.
- Proposed fact is only valid for a one-off requirement.
- Proposed fact depends on unresolved review or test feedback.
- Sync would require modifying production code, spec, plan, or tasks.
- Standard entry coverage audit is `BLOCKED` when the sync target is `.specify/business_domain/**`.

## Entry Coverage Blocking

Before writing stable facts to `.specify/business_domain/**`, run the standard strict audit when `.specify/entry-coverage-profile.yaml` exists:

```bash
${AI_SDLC_STANDARD_HOME}/scripts/audit-entry-coverage.rb <target-project-path> --strict
```

Block Sync when:

- the runner exits non-zero;
- `.specify/reports/entry_coverage/entry_coverage_report.md` status is `BLOCKED` or `PENDING`;
- `unarchived_entries.md`, `unarchived_services.md`, or `cross_domain_conflicts.md` contains blocking rows relevant to the sync target.

If business-domain documents are intentionally not initialized yet, route to business-domain bootstrap or owner confirmation before Sync writes long-term facts.

## Create-If-Missing Blocking

Block create-if-missing instead of creating or writing to `99PendingConfirmation` when:

- confirmed L1/L2 route is missing;
- target owner is unclear;
- create-if-missing authorization is missing or only implied by generic write authorization;
- L4 id reservation is ambiguous;
- Project Type Profiles from `specs/{feature}/route.md` or Pipeline Domain Route Summary are missing or conflict with the requested target;
- `Selected L4 Template` is missing or the selected `templates/business-domain-l4/{profile}.md` skeleton is missing;
- the L2 main document index cannot be updated;
- `01DomainCatalog.md` cannot be updated;
- candidate facts are proposed, unverified, one-off, or only requirement-specific;
- existing business_domain facts conflict with the proposed document;
- entry coverage audit cannot run or returns `BLOCKED` / `PENDING`.

The blocked result must explain the earliest Re-Gate node: business-domain bootstrap, owner confirmation, Plan route correction, implementation evidence, test/review closure, or code-doc reconcile.

## Conflict Handling

When source and target conflict:

- Do not overwrite target knowledge silently.
- Identify both statements and source evidence.
- Determine whether the conflict is code drift, document drift, or new requirement behavior.
- Recommend the earliest affected Re-Gate node.
- Recommend `sdlc-speckit-code-doc-reconcile` when a code/document consistency audit is needed.

## Re-Gate Routing

Route blockers to:

- `01-技术方案` when domain behavior is missing or changed.
- `02-方案审核` when risk acceptance or review decision is missing.
- `sdlc-speckit-implement` when implementation evidence is incomplete.
- `sdlc-implementation-recorder` when implementation record is missing.
- `sdlc-test-feedback-sync` when test feedback exposes reusable checklist or schema gaps.
- `sdlc-speckit-code-doc-reconcile` when code and knowledge disagree.

## No-Write Mode

Use no-write mode when:

- Authorization is missing.
- Target path is unclear.
- The user asks for a proposal only.
- The repository is read-only.

In no-write mode, output proposed changes and manifest recommendations without editing target files.
