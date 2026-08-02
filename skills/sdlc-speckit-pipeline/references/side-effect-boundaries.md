# Side Effect Boundaries

## Pipeline Controller Boundary

The Pipeline controller coordinates only Core child skills (Preflight, Domain
Route, Specify, Clarify, Plan, Tasks, Analyze, Implement) and ends after
Implement. It does not coordinate Tail execution: Sync, Reconcile, and the Tail
Completion Gate run inside the Shared Documentation Governance Tail.

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

After Clarify passes, Plan, Tasks, Analyze, and Implement execute as a continuous Core segment without stage-by-stage transition prompts. The continuous segment does not include Sync or Reconcile. Required Core authorizations (implementation authorization, Core accepted-risk owner) must be collected before entering that segment; otherwise stop at the Clarify boundary.

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

The Pipeline and its Pipeline Core must not write knowledge. Knowledge writes
belong only to `sdlc-speckit-sync` inside the Shared Tail, and only when:

- Target path is explicit.
- Facts are stable, reusable, and verified.
- User authorizes writing.
- Existing knowledge ownership is clear.

The Pipeline Handoff may only hand over target/evidence candidates
(`candidate_evidence_only=true`); it never performs the knowledge write.

## Reconcile Side Effects

The Pipeline does not execute Reconcile audit or apply. Reconcile belongs to
the Shared Tail. Apply authorization is obtained independently by the Reconcile
owner (`sdlc-speckit-code-doc-reconcile`) when apply is requested.

## Manifest Side Effects

The Pipeline may only recommend Tail status=`in_progress`. It must not
recommend Tail completed and must not set a completion source; Tail completion
is decided by the Manifest current state and the Tail Completion Gate.

## Command Side Effects

Allowed:

- Non-destructive inspection commands.
- Stage-specific validation commands required by child skill contracts.

Avoid:

- Destructive git operations.
- Database writes.
- External publishing.
- Background automation changes.
