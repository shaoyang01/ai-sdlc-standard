# Gate And Re-Gate

## Gate Stops

Gate Stops control the Pipeline Core only. Stop Pipeline when any Core stage returns:

- `FAIL`.
- `BLOCKED`.
- Unresolved Critical issue.
- Unaccepted High risk.
- Missing current artifact.
- Stale or replaced artifact.
- Undefined business behavior.
- Scope change without approval.

## Earliest Affected Node

Route Core blockers to the earliest affected node:

| Blocker | Route |
| --- | --- |
| Requirement source is unclear | `sdlc-requirement-normalizer` |
| Technical solution is incomplete | `sdlc-specification-writer` |
| Solution review failed or risk not accepted | `sdlc-solution-reviewer` |
| Spec does not match approved DocFlow | `sdlc-speckit-specify` |
| Core question remains unanswered | `sdlc-speckit-clarify` then DocFlow Re-Gate |
| Plan changes approved behavior | `sdlc-speckit-plan` then DocFlow Re-Gate |
| Tasks are untraceable | `sdlc-speckit-tasks` |
| Cross-artifact inconsistency exists | `sdlc-speckit-analyze` |
| Code implementation is wrong | `sdlc-speckit-implement` |

## Preflight Blocker Route

Missing current business-domain knowledge is a Core input readiness blocker, not a Tail item:

| Blocker | Core Result | Earliest Affected Node | Tail Entry Eligible | Next Step |
| --- | --- | --- | --- | --- |
| `INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED` | `BLOCKED` | Preflight | false | independent bootstrap outside the Pipeline (with independent authorization), then re-enter Pipeline Preflight |

Do not route this blocker to Shared Tail Sync. First-time business-domain
bootstrap is a Core input readiness problem; Shared Tail Sync handles stable
post-implementation fact sync and must not be used to bypass a missing Core
knowledge input. This blocker does not produce a Shared Tail Handoff and does
not make Tail entry eligible.

## Shared Tail Handoff Routes

The following are no longer Pipeline-internal child-stage routes:

- stable knowledge missing -> Pipeline Sync stage;
- code/doc drift -> Pipeline Reconcile stage.

They route into the Shared Tail Handoff instead:

- knowledge decision/execution pending (business_domain_sync);
- Reconcile decision/execution pending;
- Entry Coverage pending;
- Tail Re-Gate pending;
- Tail completion pending.

These items can block requirement completion, but they must not make a completed Core look unexecuted. Distinguish:

- `core_completion`: Pipeline Core through Implement is complete.
- `tail_completion`: Shared Tail and Tail Completion Gate are complete.
- earliest affected Core node.
- Tail next owner (Sync / Reconcile / Gate Runner or other Tail owner).

## Confirmation Boundaries

Require explicit user confirmation before:

- Entering full SDD when the route was `DIRECT_IMPLEMENTATION`.
- Starting implementation.
- Continuing after a `PASS_WITH_RISK` when risk ownership changed.

Sync write authorization and Reconcile apply authorization are obtained by the
Shared Tail skills when needed; the Pipeline does not collect them as Core
prerequisites and does not apply Sync or Reconcile.

## Re-Gate Record

Recommend a Re-Gate record containing:

- Triggering stage.
- Blocking evidence.
- Earliest affected node.
- Stale or replaced artifacts.
- Required new artifacts.
- Whether implementation is blocked and whether the online admission summary needs a risk note.
