# Side Effect Boundaries

## Pipeline Controller Boundary

The Pipeline controller can coordinate side effects, but child skills own execution details.

Do not directly perform child-stage work when a specialized `sdlc-*` skill exists.

Do not invoke legacy `speckit-*` Skills during target-project runtime. Legacy Skills are development-time fixtures only.

## Legacy Rail Runtime Boundary

The new rail must preserve, but not read or write, legacy governance paths:

- `.specify/memory/**`
- `.specify/workflow/**`
- `.specify/coding_guide/**`

Do not create, update, compare, or normalize these paths during normal `sdlc-speckit-pipeline` execution.

If a required fact exists only in a legacy path, stop and request target-code evidence, generated business_domain evidence, or explicit user confirmation. Do not import the legacy document into project-context automatically.

## Transition Side Effect Boundary

Pre-Clarify stages may ask whether to enter the next stage.

After Clarify passes, Plan, Tasks, Analyze, Implement, Sync, and Reconcile execute as a continuous segment without stage-by-stage transition prompts. Required write authorizations must be collected before entering that segment; otherwise stop at the Clarify boundary.

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
