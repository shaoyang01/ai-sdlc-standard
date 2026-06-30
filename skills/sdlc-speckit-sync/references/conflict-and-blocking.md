# Conflict And Blocking

## Blocking Conditions

Stop when:

- Implementation is not verified.
- Source artifacts are missing or superseded.
- Target path is unclear.
- User did not authorize writing to the target.
- Proposed fact conflicts with existing knowledge.
- Proposed fact is not stable or reusable.
- Proposed fact depends on unresolved review or test feedback.
- Sync would require modifying production code, spec, plan, or tasks.

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
