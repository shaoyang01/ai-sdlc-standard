# Side Effect Boundaries

## Pipeline Controller Boundary

The Pipeline controller can coordinate side effects, but child skills own execution details.

Do not directly perform child-stage work when a specialized `sdlc-*` skill exists.

## Documentation Side Effects

Allowed through child skills:

- Create or update `specs/**`.
- Recommend or write DocFlow records.
- Recommend manifest Activity Log, Change History, Re-Gate, Sync, or Reconcile updates.

Require current Gate context before writing any document.

## Code Side Effects

Code modification is allowed only inside `sdlc-speckit-implement`.

Before code modification:

- Analyze Gate must pass.
- User must confirm implementation.
- Task scope must be current.
- Data cases and verification scope must be modeled by the implementation skill.

## Knowledge Side Effects

Knowledge writes are allowed only inside `sdlc-speckit-sync` and only when:

- Target path is explicit.
- Facts are stable, reusable, and verified.
- User authorizes writing.
- Existing knowledge ownership is clear.

## Reconcile Side Effects

Reconcile defaults to read-only audit.

Apply document or knowledge updates only when the user explicitly requests apply behavior and the responsible target is clear.

## Command Side Effects

Allowed:

- Non-destructive inspection commands.
- Stage-specific validation commands required by child skill contracts.

Avoid:

- Destructive git operations.
- Database writes.
- External publishing.
- Background automation changes.
