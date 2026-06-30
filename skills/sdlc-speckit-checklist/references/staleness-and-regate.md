# Staleness And Re-Gate

## Stale Checklist Signals

Mark a checklist stale when:

- Source artifact version changed.
- Manifest marks the source artifact superseded.
- Change History changes scope, risk, or acceptance criteria.
- A Re-Gate record exists after checklist creation.
- `tasks.md` status or task list changed after checklist creation.
- Implementation, review, or test feedback contradicts a checklist item.

## Invalid Item Signals

Mark an item invalid when:

- It has no current source artifact.
- It depends on superseded scope.
- It contradicts approved spec, plan, tasks, or DocFlow.
- It requires new behavior.
- It was copied from a generic checklist but does not apply to the requirement.

## Re-Gate Routing

Route to:

| Finding | Route |
| --- | --- |
| Requirement source missing | `sdlc-requirement-normalizer` |
| Technical solution missing item | `sdlc-specification-writer` |
| Solution risk not accepted | `sdlc-solution-reviewer` |
| Spec stale | `sdlc-speckit-specify` |
| Residual question found | `sdlc-speckit-clarify` |
| Plan stale or incomplete | `sdlc-speckit-plan` |
| Tasks stale or incomplete | `sdlc-speckit-tasks` |
| Cross-artifact conflict | `sdlc-speckit-analyze` |
| Implementation evidence missing | `sdlc-speckit-implement` or `sdlc-implementation-recorder` |
| Reusable checklist rule discovered | `sdlc-test-feedback-sync` or `sdlc-speckit-sync` |

## Stop Rule

Stop when more than one current source claims different behavior. A checklist cannot resolve source-of-truth conflicts.
