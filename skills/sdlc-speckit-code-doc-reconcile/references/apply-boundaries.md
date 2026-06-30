# Apply Boundaries

## Default Side Effect

Default side effect is a reconciliation report only.

Allowed without additional authorization:

- Read code and documents.
- Run non-destructive inspection commands.
- Produce a drift matrix.
- Recommend Re-Gate, sync, manifest, or record updates.

## Production Code Boundary

Never modify production code in this skill.

When code is wrong:

- Classify as `CODE_DRIFT`.
- Route to `sdlc-speckit-implement`.
- Include affected files and approved artifact evidence.

## Spec And DocFlow Boundary

Do not modify `specs/**` or `library/{requirement_id}/**` unless the user explicitly asks this skill to prepare or apply document updates.

When documentation is wrong:

- Classify as `SPEC_DRIFT`, `DOCFLOW_DRIFT`, or `MANIFEST_DRIFT`.
- Identify the responsible upstream Skill.
- Prefer a proposal when ownership is unclear.

## Knowledge Boundary

Do not modify `.specify/business_domain/**` or other knowledge targets unless:

- The target path is explicit.
- The fact is stable and reusable.
- Evidence is verified.
- The user authorizes writing.

Otherwise route to `sdlc-speckit-sync` with a proposed target and evidence list.

## Manifest Boundary

Recommend manifest updates for:

- Reconcile execution.
- Drift classification.
- Re-Gate recommendation.
- Sync or manifest correction recommendation.
- Residual risk.

Apply manifest changes only when the user explicitly asks for written output in this repository.

## Command Boundary

Allowed commands:

- `git status`, `git diff`, `git log`, `rg`, `find`, `sed`, `cat`.
- Build or test commands only when needed to verify claimed behavior and safe for the repository.

Avoid:

- Destructive git commands.
- Database writes or external side effects.
- Any command that changes production code to resolve drift.
